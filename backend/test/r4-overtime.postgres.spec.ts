import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import ExcelJS from 'exceljs';
import type { CreateOvertimeDto, SetOvertimeRouteDto } from '../src/modules/overtime/overtime.dto.js';

interface Actor { id: string; employeeId: string; token: string }
const label = 'R4 OT development-only acceptance';

describe.skipIf(process.env.R4_OT_POSTGRES_TEST !== '1')('R4 OT workflow — isolated PostgreSQL/API', () => {
  const name = `r4_ot_test_${randomUUID().replaceAll('-','')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let maintenance: DataSource, db: DataSource, created = false, child: ChildProcess | undefined;
  let api = '', storage = '', branch = '', department = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('R4 needs local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options,url: url.toString() }); await db.initialize(); await db.runMigrations();
    storage = await mkdtemp(join(tmpdir(),'r4-ot-evidence-'));
    const [b] = await db.query<Array<{ id: string }>>(`INSERT INTO branches(code,name) VALUES('R4-OT',$1) RETURNING id`,[label]); branch = b.id;
    const [d] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES('R4-OT',$1) RETURNING id`,[label]); department = d.id;
    await db.query(`INSERT INTO office_locations(name,address,latitude,longitude,radius_meters,accuracy_threshold_meters,branch_id) VALUES($1,$1,10,106,100,50,$2)`,[label,branch]);
    const probe = createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done,reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath,['dist/main.js'],{ stdio:'ignore',env:{ ...process.env,DATABASE_URL:url.toString(),PORT:String(port),JWT_SECRET:secret,EVIDENCE_STORAGE_DIR:storage,
      SMTP_HOST:'',SMTP_FROM:'',ADMIN_LOGIN_ALERT_EMAILS:'',FIREBASE_PUSH_ENABLED:'false',NODE_ENV:'development',CORS_ORIGIN:'http://localhost:3000' } });
    for (let i=0;i<250;i++) {
      if (child.exitCode !== null) throw new Error('Build API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor(RoleCode.Admin); return; }
      await delay(100);
    }
    throw new Error('R4 isolated API readiness timeout');
  },40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child,'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r4_ot_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(storage) === tmpdir() && basename(storage).startsWith('r4-ot-evidence-')) await rm(storage,{ recursive:true,force:true });
  },15_000);
  async function actor(role: RoleCode = RoleCode.Employee): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`,[`r4-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2',[u.id,role]);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES($1,$2,$3,$4) RETURNING id`,[randomUUID().slice(0,28),label,u.id,department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`,[e.id,branch,department]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`,[u.id,randomUUID(),label]);
    return { id:u.id,employeeId:e.id,token:await jwt.signAsync({ sub:u.id,sid:s.id,roles:[RoleCode.Admin] },{ expiresIn:900 }) };
  }
  async function call<T = Record<string,unknown>>(path: string, method = 'GET', body?: unknown, who = admin): Promise<{ status:number; body:T }> {
    const r = await fetch(`${api}${path}`,{ method,headers:{ Authorization:`Bearer ${who.token}`,...(body === undefined ? {} : { 'Content-Type':'application/json' }) },body:body === undefined ? undefined : JSON.stringify(body) });
    return { status:r.status,body:await r.json() as T };
  }

  interface OT { id:string; routeVersion:number; status:string; approvalStage:string; canConfirm:boolean; canReview:boolean; canAdminReview:boolean; code?:string; }
  const date = ():string => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
  const payload = (extra = {}): CreateOvertimeDto => ({ submissionId:randomUUID(),workDate:date(),requestedMinutes:90,reason:label,workContent:label,...extra });
  async function submit(p:Actor, input=payload()):Promise<OT> { const r=await call<OT>('/overtime-requests/mine','POST',input,p); expect(r.status).toBe(201); return r.body; }
  async function routing(p:Actor):Promise<{leader:Actor;head:Actor;teamId:string}> {
    const leader=await actor(),head=await actor();
    const [team]=await db.query<Array<{id:string}>>(`INSERT INTO organization_teams(department_id,code,name,created_by) VALUES($1,$2,$3,$4) RETURNING id`,[department,'OT-'+randomUUID().slice(0,8).toUpperCase(),label,admin.id]);
    await db.query('INSERT INTO organization_team_memberships(team_id,employee_id,created_by) VALUES($1,$2,$3)',[team.id,p.employeeId,admin.id]);
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,team_id,appointment_type,valid_from,reason,created_by) VALUES($1,'TEAM_LEADER',$2,'OFFICIAL',now()-interval '1 day',$3,$4)`,[leader.id,team.id,label,admin.id]);
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL',now()-interval '1 day',$3,$4)`,[head.id,department,label,admin.id]);
    return {leader,head,teamId:team.id};
  }
  const routeBody = (r:Awaited<ReturnType<typeof routing>>,expectedVersion=0): SetOvertimeRouteDto => ({ teamId:r.teamId,leaderUserId:r.leader.id,headUserId:r.head.id,expectedVersion,reason:label });
  async function setRoute(p:Actor,r:Awaited<ReturnType<typeof routing>>):Promise<void> { expect((await call('/overtime-requests/routes/'+p.employeeId,'PUT',routeBody(r))).status).toBe(200); }
  const decideOT = (item:OT,p:Actor,action:string,extra={}): Promise<{status:number;body:OT}> => call<OT>(`/overtime-requests/${item.id}/${action==='CONFIRM'?'confirm':'review'}`,'PATCH',{expectedVersion:item.routeVersion,...(action==='CONFIRM'?{}:{status:action,reviewNote:label}),...extra},p);

  it('validates date/minutes/contents and refuses forged ownership/null inputs',async()=>{
    const p=await actor();
    for (const invalid of [{workDate:'2026-02-30'},{workDate:'2200-01-01'},{requestedMinutes:0},{requestedMinutes:1.5},{requestedMinutes:1441},{workContent:'     '},{reason:null},{employeeId:p.employeeId}]) expect((await call('/overtime-requests/mine','POST',payload(invalid),p)).status).toBe(400);
    expect((await call('/overtime-requests/routes','GET',undefined,p)).status).toBe(403);
  });
  it('uses independent OT defaults, then enforces Leader before Head with no healthy-route Admin bypass',async()=>{
    const p=await actor(),r=await routing(p),other=await actor();
    await db.query('INSERT INTO leave_approval_routes(employee_id,team_id,leader_user_id,head_user_id,reason,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[p.employeeId,r.teamId,r.leader.id,r.head.id,label,admin.id]);
    const item=await submit(p); expect(item.approvalStage).toBe('WAITING_ROUTING');
    await setRoute(p,r);
    const [live]=(await call<OT[]>('/overtime-requests/mine','GET',undefined,p)).body; expect(live.routeVersion).toBe(2); expect(live.approvalStage).toBe('LEADER_CONFIRMATION');
    expect((await decideOT(live,r.head,'APPROVED')).status).toBe(403);
    expect((await decideOT(live,admin,'APPROVED',{adminOverrideReason:label})).status).toBe(403);
    expect((await decideOT(live,p,'CONFIRM')).status).toBe(403);
    expect((await call('/overtime-requests/'+live.id+'/history','GET',undefined,other)).status).toBe(404);
    expect((await call('/overtime-requests','GET',undefined,other)).status).toBe(403);
    const confirmed=await decideOT(live,r.leader,'CONFIRM'); expect(confirmed.status).toBe(200);
    expect((await decideOT(confirmed.body,r.head,'APPROVED')).status).toBe(200);
  });
  it('Admin fallback only on broken routing; only approved minutes appear in report/Today and notifications name the actor',async()=>{
    const p=await actor(),item=await submit(p);
    const before=await call<Array<{employeeId:string;overtimeMinutes:number}>>('/reporting/monthly?month='+date().slice(0,7)+'&employeeId='+p.employeeId);
    expect(before.body.reduce((n,r)=>n+r.overtimeMinutes,0)).toBe(0);
    const result=await decideOT(item,admin,'APPROVED',{adminOverrideReason:label}); expect(result.status).toBe(200);
    const after=await call<Array<{employeeId:string;overtimeMinutes:number}>>('/reporting/monthly?month='+date().slice(0,7)+'&employeeId='+p.employeeId);
    expect(after.body.find(r=>r.employeeId===p.employeeId)?.overtimeMinutes).toBe(90);
    const excel = await fetch(`${api}/reporting/monthly/export?month=${date().slice(0,7)}&employeeId=${p.employeeId}`, { headers:{Authorization:`Bearer ${admin.token}`} });
    expect(excel.status).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await excel.arrayBuffer());
    expect(workbook.getWorksheet('Chi tiết ngày')!.getCell('I2').value).toBe(90);
    expect((await call('/attendance/me/today','GET',undefined,p)).body.overtimeMinutes).toBe(90);
    expect(await db.query(`SELECT decision_method,confirmed_by FROM overtime_requests WHERE id=$1`,[item.id])).toEqual([{decision_method:'ADMIN_FALLBACK',confirmed_by:null}]);
    const notes=await db.query<Array<{body:string}>>('SELECT body FROM announcements WHERE employee_id=$1',[p.employeeId]); expect(notes.some(n=>n.body.includes('Đã duyệt bởi '+label))).toBe(true);
    expect((await call('/overtime-requests/'+item.id+'/history','GET',undefined,p)).status).toBe(200);
  });
  it('serializes idempotent submissions and prevents distinct submissions for the same day',async()=>{
    const p=await actor(),body=payload();
    const result=await Promise.all([call<OT>('/overtime-requests/mine','POST',body,p),call<OT>('/overtime-requests/mine','POST',body,p)]);
    expect(result.map(r=>r.status)).toEqual([201,201]); expect(result[0].body.id).toBe(result[1].body.id);
    expect((await call('/overtime-requests/mine','POST',{...body,requestedMinutes:120},p)).body.code).toBe('OVERTIME_SUBMISSION_CHANGED');
    expect((await call('/overtime-requests/mine','POST',payload(),p)).body.code).toBe('OVERTIME_DAILY_LIMIT');
    expect((await db.query<Array<{count:number}>>("SELECT count(*)::int AS count FROM configuration_audit_logs WHERE resource_id=$1 AND action='SUBMIT'",[result[0].body.id]))[0].count).toBe(1);
    const fresh=await actor();
    const competing=await Promise.all([call('/overtime-requests/mine','POST',payload(),fresh),call('/overtime-requests/mine','POST',payload(),fresh)]);
    expect(competing.map(r=>r.status).sort()).toEqual([201,409]);
  });
  it('guards versions/concurrency and keeps completed confirmation when Head loses access',async()=>{
    const p=await actor(),r=await routing(p); await setRoute(p,r); const item=await submit(p);
    const confirmed=await Promise.all([decideOT(item,r.leader,'CONFIRM'),decideOT(item,r.leader,'CONFIRM')]); expect(confirmed.map(r=>r.status).sort()).toEqual([200,409]);
    const current=confirmed.find(r=>r.status===200)!.body;
    await db.query(`UPDATE organization_management_grants SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE user_id=$1`,[r.head.id,admin.id,label]);
    expect((await decideOT(current,r.head,'APPROVED')).status).toBe(403);
    expect((await decideOT(current,admin,'APPROVED',{adminOverrideReason:label})).status).toBe(200);
    expect((await db.query<Array<{confirmed_by:string}>>('SELECT confirmed_by FROM overtime_requests WHERE id=$1',[item.id]))[0].confirmed_by).toBe(r.leader.id);
    expect((await decideOT(current,admin,'APPROVED',{adminOverrideReason:label})).status).toBe(409);
  });
  it('rejects with a reason, permits resubmission, and respects locked periods',async()=>{
    const p=await actor(),item=await submit(p);
    expect((await decideOT(item,admin,'REJECTED',{reviewNote:' ',adminOverrideReason:label})).status).toBe(400);
    expect((await decideOT(item,admin,'REJECTED',{adminOverrideReason:label})).status).toBe(200);
    const next=await submit(p); expect(next.id).not.toBe(item.id);
    await db.query(`UPDATE attendance_periods SET status='LOCKED' WHERE period_month=date_trunc('month',$1::date)`,[date()]);
    expect((await decideOT(next,admin,'APPROVED',{adminOverrideReason:label})).body.code).toBe('ATTENDANCE_PERIOD_LOCKED');
    expect((await call('/overtime-requests/mine','POST',payload(),await actor())).body.code).toBe('ATTENDANCE_PERIOD_LOCKED');
    await db.query("UPDATE attendance_periods SET status='OPEN'");
  });
  it('deletes OT requests/defaults with employee purge and keeps independent leave configuration',async()=>{
    const p=await actor(),r=await routing(p); await setRoute(p,r); await submit(p);
    const impact=await call<{counts:Record<string,number>;confirmationToken:string;employeeCode:string}>('/employees/'+p.employeeId+'/deletion-impact');
    expect(impact.body.counts.overtime_requests).toBe(1); expect(impact.body.counts.overtime_approval_routes).toBe(1);
    expect((await call('/employees/'+p.employeeId,'DELETE',{employeeCode:impact.body.employeeCode,confirmationToken:impact.body.confirmationToken,reason:label})).status).toBe(200);
    expect(await db.query('SELECT id FROM overtime_requests WHERE employee_id=$1',[p.employeeId])).toEqual([]);
    expect(await db.query('SELECT employee_id FROM overtime_approval_routes WHERE employee_id=$1',[p.employeeId])).toEqual([]);
  });
  it('reroutes only unfinished steps and keeps completed team/Leader/time',async()=>{
    const p=await actor(),r=await routing(p); await setRoute(p,r);
    const confirmed=(await decideOT(await submit(p),r.leader,'CONFIRM')).body;
    const replacement=await actor();
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL',now()-interval '1 day',$3,$4)`,[replacement.id,department,label,admin.id]);
    expect((await call('/overtime-requests/'+confirmed.id+'/reroute','PATCH',{...routeBody(r,confirmed.routeVersion),leaderUserId:replacement.id})).status).toBe(409);
    const changed=await call<OT>('/overtime-requests/'+confirmed.id+'/reroute','PATCH',{...routeBody(r,confirmed.routeVersion),headUserId:replacement.id}); expect(changed.status).toBe(200);
    const [row]=await db.query<Array<{confirmed_by:string;workflow_team_id:string}>>('SELECT confirmed_by,workflow_team_id FROM overtime_requests WHERE id=$1',[confirmed.id]); expect(row).toEqual({confirmed_by:r.leader.id,workflow_team_id:r.teamId});
    expect((await decideOT(changed.body,replacement,'APPROVED')).status).toBe(200);
  });
  it('pending OT is an explicit monthly blocker and cannot be silently finalized',async()=>{
    const p=await actor(); await submit(p);
    const summary=await call<{pendingOvertimeCount:number;blockerCount:number}>('/reporting/monthly/summary?month='+date().slice(0,7));
    expect(summary.status).toBe(200); expect(summary.body.pendingOvertimeCount).toBeGreaterThan(0); expect(summary.body.blockerCount).toBeGreaterThan(0);
    expect((await call('/reporting/periods/'+date().slice(0,7)+'/lock','POST',{reason:label})).body.code).toBe('ATTENDANCE_PERIOD_HAS_BLOCKERS');
    expect((await db.query<Array<{status:string}>>('SELECT status FROM attendance_periods WHERE period_month=date_trunc(\'month\',$1::date)',[date()]))[0].status).toBe('OPEN');
  });
});
