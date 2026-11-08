import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { businessTripPeriod } from '../src/modules/business-trips/domain/business-trip-code.js';
import { BusinessTripEvidenceOwnership1792713600000 } from '../src/database/migrations/1792713600000-business-trip-evidence-ownership.js';

interface Actor { id: string; employeeId: string; token: string }
interface Trip { id: string; code: string; status: string; customerId: string | null }
const label = 'R8 development-only acceptance';
const base = '/business-trips';
const gps = { latitude: 10, longitude: 106, accuracyMeters: 5, deviceTime: '2000-01-01T00:00:00Z' };
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');

// Never use live customer accounts/tokens or evidence. Explicit opt-in, owned temporary DB/API/storage.
describe.skipIf(process.env.R8_POSTGRES_TEST !== '1')('R8 business trips/customers — isolated PostgreSQL and HTTP', () => {
  const name = `r8_trips_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let maintenance: DataSource, db: DataSource, created = false, child: ChildProcess | undefined;
  let api = '', storage = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('R8 requires local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    storage = await mkdtemp(join(tmpdir(), 'r8-trip-evidence-'));
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done,reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R8_API_ENTRY ?? 'dist/r8/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      BUSINESS_TRIP_EVIDENCE_STORAGE_DIR: storage, EVIDENCE_STORAGE_DIR: storage,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000',
    } });
    for (let i=0;i<250;i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R8 API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor(true); return; }
      await delay(100);
    }
    throw new Error('R8 API readiness timeout');
  },40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited=once(child,'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r8_trips_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(resolve(storage))===resolve(tmpdir()) && basename(storage).startsWith('r8-trip-evidence-')) await rm(storage,{recursive:true,force:true});
  },15_000);
  async function actor(isAdmin=false): Promise<Actor> {
    const [u] = await db.query<Array<{id:string}>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`,[`r8-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2',[u.id,isAdmin?'ADMIN':'EMPLOYEE']);
    const [e] = await db.query<Array<{id:string}>>('INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id',[randomUUID().slice(0,28),label,u.id]);
    const [s] = await db.query<Array<{id:string}>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`,[u.id,randomUUID(),label]);
    // Forged role claim proves the live role reader is authoritative.
    return {id:u.id,employeeId:e.id,token:await jwt.signAsync({sub:u.id,sid:s.id,roles:['ADMIN']},{expiresIn:900})};
  }
  async function call<T = Record<string,unknown>>(path:string,method='GET',body?:unknown,p=admin): Promise<{status:number;body:T}> {
    const r=await fetch(`${api}${path}`,{method,headers:{Authorization:`Bearer ${p.token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10_000)});
    return {status:r.status,body:await r.json() as T};
  }
  const input=(members:Actor[],extra={}):Record<string,unknown> => ({siteName:label,siteAddress:label,startAt:'2030-01-01T08:00:00+07:00',endAt:'2030-01-03T17:00:00+07:00',content:label,requiresPhoto:false,responsibleEmployeeId:members[0].employeeId,memberIds:members.map(p=>p.employeeId),...extra});
  async function trip(members:Actor[],extra={}):Promise<Trip> { const r=await call<Trip>(base,'POST',input(members,extra)); expect(r.status).toBe(201); return r.body; }
  async function assign(t:Trip):Promise<void> {expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'ASSIGNED'})).status).toBe(200);}
  const start=(t:Trip,p:Actor,extra={}):Promise<{status:number;body:Record<string,unknown>}>=>call(`${base}/${t.id}/start`,'POST',{...gps,...extra},p);
  const complete=(t:Trip,p:Actor,extra={}):Promise<{status:number;body:Record<string,unknown>}>=>call(`${base}/${t.id}/complete`,'POST',{...gps,note:label,...extra},p);
  async function customer():Promise<{id:string}> { const r=await call<{id:string}>(`${base}/customers`,'POST',{name:label,address:label}); expect(r.status).toBe(201); return r.body; }
  const audits=(id:string,action:string):Promise<Array<{id:string}>>=>db.query('SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action=$2',[id,action]);
  async function upload(p:Actor,id=randomUUID(),bytes=photo,mime='image/png'):Promise<{status:number;reference:string}> {
    const form=new FormData();form.set('evidenceId',id);form.set('file',new Blob([new Uint8Array(bytes)],{type:mime}),'development-only.png');
    const r=await fetch(`${api}${base}/evidence`,{method:'POST',headers:{Authorization:`Bearer ${p.token}`},body:form,signal:AbortSignal.timeout(10_000)});
    return {status:r.status,reference:((await r.json()) as {reference:string}).reference};
  }
  const image=(p:Actor,ref:string):Promise<Response>=>fetch(`${api}${ref.replace(/^\/api/,'')}`,{headers:{Authorization:`Bearer ${p.token}`}});

  it('preserves the customer link when PATCH omits customerId; explicit null unlinks it',async()=>{
    const p=await actor(),c=await customer(),t=await trip([p],{customerId:c.id});
    const r=await call<Trip>(`${base}/${t.id}`,'PATCH',{content:`${label} updated`});expect(r.status).toBe(200);expect(r.body.customerId).toBe(c.id);
    const clear=await call<Trip>(`${base}/${t.id}`,'PATCH',{customerId:null});expect(clear.status).toBe(200);expect(clear.body.customerId).toBeNull();
  });
  it('denies unrelated authenticated image readers; owner/Admin can read and no JWT gets 401',async()=>{
    const p=await actor(),other=await actor(),u=await upload(p);expect(u.status).toBe(201);
    expect((await image(p,u.reference)).status).toBe(200);expect((await image(admin,u.reference)).status).toBe(200);
    expect((await image(other,u.reference)).status).toBe(404);expect((await fetch(`${api}${u.reference.replace(/^\/api/,'')}`)).status).toBe(401);
  });
  it('prevents overwriting an upload UUID across owners or after attachment; identical retry succeeds',async()=>{
    const p=await actor(),other=await actor(),id=randomUUID(),u=await upload(p,id);expect(u.status).toBe(201);
    expect((await upload(other,id)).status).toBe(400);
    const t=await trip([p],{requiresPhoto:true});await assign(t);expect((await start(t,p)).status).toBe(201);
    expect((await complete(t,p,{evidenceImageReference:u.reference,evidenceCapturedAt:new Date().toISOString()})).status).toBe(201);
    expect((await upload(p,id,Buffer.concat([photo,Buffer.from('changed')]))).status).toBe(400);expect((await upload(p,id)).status).toBe(201);
    expect(Buffer.from(await (await image(p,u.reference)).arrayBuffer()).equals(photo)).toBe(true);
  });
  it('rejects forged/external/nonexistent and foreign image references before completion',async()=>{
    const p=await actor(),other=await actor(),foreign=await upload(other),t=await trip([p],{requiresPhoto:true});await assign(t);expect((await start(t,p)).status).toBe(201);
    for(const ref of ['https://example.invalid/photo.png',`/api/business-trips/evidence/${randomUUID()}.png`,foreign.reference]) expect((await complete(t,p,{evidenceImageReference:ref,evidenceCapturedAt:new Date().toISOString()})).status).toBe(400);
    expect(await audits(t.id,'MEMBER_COMPLETE')).toHaveLength(0);
  });
  it('assigns exactly once with an inbox message per member; hides draft tickets from employees',async()=>{
    const p=await actor(),q=await actor(),t=await trip([p,q]);
    expect((await call<Trip[]>(`${base}/mine`,'GET',undefined,p)).body.some(x=>x.id===t.id)).toBe(false);
    const results=await Promise.all([1,2].map(()=>call(`${base}/${t.id}/status`,'PATCH',{status:'ASSIGNED'})));expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const rows=await db.query<Array<{employee_id:string}>>('SELECT r.employee_id FROM announcement_recipients r JOIN announcements a ON a.id=r.announcement_id WHERE a.body LIKE $1',[`%${t.code}%`]);
    expect(rows.map(r=>r.employee_id).sort()).toEqual([p.employeeId,q.employeeId].sort());expect(await audits(t.id,'ASSIGN')).toHaveLength(1);
  });
  it('revalidates active assigned members instead of handing out a draft whose member was disabled',async()=>{
    const p=await actor(),t=await trip([p]);await db.query("UPDATE employees SET is_active=false,employment_end_date=current_date,employment_status_reason=$2,status_changed_at=now(),status_changed_by=$3 WHERE id=$1",[p.employeeId,label,admin.id]);
    expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'ASSIGNED'})).status).toBe(400);expect(await audits(t.id,'ASSIGN')).toHaveLength(0);
  });
  it('rejects null required PATCH fields, blank/oversized trip text, string GPS and trimmed-short cancellation reasons',async()=>{
    const p=await actor(),t=await trip([p]);
    for(const extra of [{requiresPhoto:null},{memberIds:null},{responsibleEmployeeId:null},{siteName:'  '},{siteAddress:'x'.repeat(301)},{startAt:null}]) expect((await call(`${base}/${t.id}`,'PATCH',extra)).status).toBe(400);
    expect((await call(base,'POST',input([p],{siteName:'',siteAddress:' '}))).status).toBe(400);
    expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'CANCELLED',reason:' x  '})).status).toBe(400);
    await assign(t);expect((await start(t,p,{latitude:'10'})).status).toBe(400);
  });
  it('rejects MIME lies/invalid signatures and oversize uploads',async()=>{
    const p=await actor();expect((await upload(p,randomUUID(),Buffer.from('not a photo'))).status).toBe(400);
    expect((await upload(p,randomUUID(),photo,'image/jpeg')).status).toBe(400);
    expect((await upload(p,randomUUID(),Buffer.alloc(5*1024*1024+1))).status).toBe(413);
  });
  it('keeps monthly codes sequential and unique under concurrent creation; client codes are ignored',async()=>{
    const p=await actor(),period=businessTripPeriod(new Date());
    const results=await Promise.all(Array.from({length:12},()=>call<Trip>(base,'POST',input([p],{code:'CLIENT-FORGED'}))));
    expect(results.every(r=>r.status===201)).toBe(true);const codes=results.map(r=>r.body.code);expect(new Set(codes).size).toBe(12);
    expect(codes.every(c=>c.startsWith(`CT-${period}-`))).toBe(true);
    const nums=codes.map(c=>Number(c.split('-').at(-1))).sort((a,b)=>a-b);expect(nums.at(-1)!-nums[0]).toBe(11);
  });
  it('enforces Admin-only writes/history and own participation even with forged ADMIN token claims',async()=>{
    const p=await actor(),other=await actor(),t=await trip([p]);await assign(t);
    for(const [path,method,body] of [[base,'GET',undefined],[base,'POST',input([p])],[`${base}/customers`,'POST',{name:label,address:label}],[`${base}/${t.id}/history`,'GET',undefined],[`${base}/${t.id}`,'PATCH',{content:label}],[`${base}/${t.id}/status`,'PATCH',{status:'CANCELLED',reason:label}]] as const) expect((await call(path,method,body,p)).status).toBe(403);
    expect((await start(t,other)).status).toBe(404);expect((await complete(t,other)).status).toBe(404);
    expect((await call<Trip[]>(`${base}/mine`,'GET',undefined,other)).body).toEqual([]);
  });
  it('serializes starts and per-member completions; only all-complete ends the trip, with no attendance writes',async()=>{
    const p=await actor(),q=await actor(),t=await trip([p,q]);await assign(t);
    expect((await complete(t,p)).status).toBe(409);
    const starts=await Promise.all([1,2].map(()=>start(t,p)));expect(starts.map(r=>r.status).sort()).toEqual([201,409]);
    const begun=starts.find(r=>r.status===201)!;expect(new Date(begun.body.startedAt as string).getUTCFullYear()).toBeGreaterThan(2020);
    expect((await complete(t,p)).body.tripStatus).toBe('IN_PROGRESS');expect((await start(t,q)).status).toBe(201);
    const ends=await Promise.all([1,2].map(()=>complete(t,q)));expect(ends.map(r=>r.status).sort()).toEqual([201,409]);expect(ends.find(r=>r.status===201)!.body.tripStatus).toBe('COMPLETED');
    expect(await audits(t.id,'MEMBER_START')).toHaveLength(2);expect(await audits(t.id,'MEMBER_COMPLETE')).toHaveLength(2);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=ANY($1::uuid[])',[[p.employeeId,q.employeeId]])).toHaveLength(0);
    expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'CANCELLED',reason:label})).status).toBe(409);
  });
  it('preserves customer history after deactivation and only offers active customers for new tickets',async()=>{
    const p=await actor(),c=await customer(),t=await trip([p],{customerId:c.id});
    expect((await call(`${base}/customers/${c.id}`,'PATCH',{isActive:false})).status).toBe(200);
    expect((await call<Array<{id:string}>>(`${base}/lookups/customers`)).body.some(x=>x.id===c.id)).toBe(false);
    expect((await call(base,'POST',input([p],{customerId:c.id}))).status).toBe(400);
    const old=await call<Trip[]>(base);expect(old.body.find(x=>x.id===t.id)!.customerId).toBe(c.id);
    expect((await call(`${base}/customers/${c.id}`,'PATCH',{contactName:'R8 contact'})).status).toBe(200);
    expect((await call(`${base}/customers/${c.id}`,'PATCH',{isActive:true})).status).toBe(200);
    expect((await call<Array<{id:string}>>(`${base}/lookups/customers`)).body.some(x=>x.id===c.id)).toBe(true);
  });
  it('counts a single field daily pair once even with multiple completed tickets and exports the same minutes',async()=>{
    const p=await actor(),now=new Date(),date=now.toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}),month=date.slice(0,7);
    for(let i=0;i<2;i++){const t=await trip([p]);await assign(t);expect((await start(t,p)).status).toBe(201);expect((await complete(t,p)).status).toBe(201);}
    // Projection fixture (not a claimed device/biometric check): valid existing capture/photo FKs.
    const [capture]=await db.query<Array<{id:string}>>(`INSERT INTO attendance_checkin_captures(employee_id,user_id,attendance_type,field_work_content,latitude,longitude,accuracy_meters,mock_location_signal) VALUES($1,$2,'BUSINESS_TRIP',$3,10,106,5,false) RETURNING id`,[p.employeeId,p.id,label]);
    for(const [event,time] of [['CHECK_IN','08:00:00'],['CHECK_OUT','16:00:00']]) await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time,latitude,longitude,accuracy_meters,daily_policy,field_work_content,checkin_capture_id,evidence_image_reference) VALUES($1,$2,'BUSINESS_TRIP',$3,10,106,5,true,$4,$5,$6)`,[p.employeeId,event,`${date}T${time}+07:00`,label,event==='CHECK_IN'?capture.id:null,event==='CHECK_IN'?`/api/attendance/evidence/${capture.id}.png`:null]);
    const report=await call<Array<Record<string,unknown>>>(`/reporting/monthly?month=${month}&employeeId=${p.employeeId}`);
    expect(report.status).toBe(200);expect(report.body.filter(r=>r.workDate===date)).toHaveLength(1);expect(report.body.find(r=>r.workDate===date)).toMatchObject({status:'BUSINESS_TRIP',workedMinutes:480,overtimeMinutes:0});
    const excel=await fetch(`${api}/reporting/monthly/export?month=${month}&employeeId=${p.employeeId}`,{headers:{Authorization:`Bearer ${admin.token}`}});expect(excel.status).toBe(200);
    const book=new ExcelJS.Workbook();await book.xlsx.load(await excel.arrayBuffer());const sheet=book.getWorksheet(`Bang cong ${month}`)!;
    expect(sheet.getCell('N2').value).toBe('Hiện trường');expect(sheet.getCell('G2').value).toBe(480);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toHaveLength(2);
  });
  it('validates responsible membership, deduplicates members, edits only drafts and preserves code',async()=>{
    const p=await actor(),q=await actor();
    expect((await call(base,'POST',input([p],{responsibleEmployeeId:q.employeeId}))).status).toBe(400);
    const t=await trip([p],{memberIds:[p.employeeId,p.employeeId]});expect(await db.query('SELECT employee_id FROM business_trip_members WHERE business_trip_id=$1',[t.id])).toHaveLength(1);
    expect((await call(`${base}/${t.id}`,'PATCH',{memberIds:[q.employeeId]})).status).toBe(400);
    const changed=await call<Trip>(`${base}/${t.id}`,'PATCH',{memberIds:[q.employeeId],responsibleEmployeeId:q.employeeId});expect(changed.status).toBe(200);expect(changed.body.code).toBe(t.code);
    await assign(t);expect((await call(`${base}/${t.id}`,'PATCH',{siteName:'Changed'})).status).toBe(409);expect((await start(t,p)).status).toBe(404);expect((await start(t,q)).status).toBe(201);
  });
  it('serializes cancel against completion and preserves already completed participation when cancelling a group',async()=>{
    const p=await actor(),q=await actor(),t=await trip([p,q]);await assign(t);expect((await start(t,p)).status).toBe(201);expect((await complete(t,p)).status).toBe(201);expect((await start(t,q)).status).toBe(201);
    expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'CANCELLED',reason:label})).status).toBe(200);
    expect((await complete(t,q)).status).toBe(409);expect((await start(t,q)).status).toBe(409);
    const statuses=await db.query<Array<{employee_id:string;participation_status:string}>>('SELECT employee_id,participation_status FROM business_trip_members WHERE business_trip_id=$1',[t.id]);
    expect(statuses.find(x=>x.employee_id===p.employeeId)!.participation_status).toBe('COMPLETED');expect(statuses.find(x=>x.employee_id===q.employeeId)!.participation_status).toBe('CANCELLED');
    const race=await trip([q]);await assign(race);expect((await start(race,q)).status).toBe(201);
    const results=await Promise.all([complete(race,q),call(`${base}/${race.id}/status`,'PATCH',{status:'CANCELLED',reason:label})]);
    expect(results.filter(r=>r.status===409)).toHaveLength(1);expect((await audits(race.id,'CANCEL')).length+(await audits(race.id,'MEMBER_COMPLETE')).length).toBe(1);
  });
  it('rolls back trip, sequence, membership and assignment inbox when audit fails',async()=>{
    const p=await actor(),t=await trip([p]),period=businessTripPeriod(new Date());
    const before=await db.query<Array<{last_value:number}>>('SELECT last_value FROM business_trip_code_counters WHERE period_key=$1',[period]);
    await db.query(`CREATE FUNCTION r8_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_type='BUSINESS_TRIP' AND NEW.action IN ('CREATE','ASSIGN') THEN RAISE EXCEPTION 'R8 injected failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r8_reject_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r8_reject_audit()');
    try {
      expect((await call(base,'POST',input([p]))).status).toBe(500);
      expect(await db.query('SELECT last_value FROM business_trip_code_counters WHERE period_key=$1',[period])).toEqual(before);
      expect((await call(`${base}/${t.id}/status`,'PATCH',{status:'ASSIGNED'})).status).toBe(500);
      expect((await call<Trip[]>(base)).body.find(x=>x.id===t.id)!.status).toBe('DRAFT');
      expect(await db.query('SELECT id FROM announcements WHERE body LIKE $1',[`%${t.code}%`])).toHaveLength(0);
    } finally {await db.query('DROP TRIGGER r8_reject_audit ON configuration_audit_logs');await db.query('DROP FUNCTION r8_reject_audit()');}
    await assign(t);
  });
  it('serializes customer edits with complete old/new audit chains and validates required fields',async()=>{
    const c=await customer();for(const extra of [{name:null},{address:null},{isActive:null},{name:'  '}]) expect((await call(`${base}/customers/${c.id}`,'PATCH',extra)).status).toBe(400);
    const results=await Promise.all([call(`${base}/customers/${c.id}`,'PATCH',{contactName:'R8 A'}),call(`${base}/customers/${c.id}`,'PATCH',{contactPhone:'R8 B'})]);expect(results.map(r=>r.status)).toEqual([200,200]);
    const all=await call<Array<Record<string,unknown>>>(`${base}/customers`);expect(all.body.find(x=>x.id===c.id)).toMatchObject({contactName:'R8 A',contactPhone:'R8 B'});
    const logs=await db.query<Array<{old_value:{contactName:string|null;contactPhone:string|null};new_value:{contactName:string|null;contactPhone:string|null}}>>("SELECT old_value,new_value FROM configuration_audit_logs WHERE resource_id=$1 AND action='UPDATE'",[c.id]);expect(logs).toHaveLength(2);
    expect(logs.some(a=>logs.some(b=>a!==b && a.new_value.contactName===b.old_value.contactName && a.new_value.contactPhone===b.old_value.contactPhone))).toBe(true);
  });
  it('requires the configured image/capture pair; optional evidence still needs ownership and valid bytes',async()=>{
    const p=await actor(),t=await trip([p],{requiresPhoto:true});await assign(t);expect((await start(t,p)).status).toBe(201);
    expect((await complete(t,p)).status).toBe(400);
    const u=await upload(p,randomUUID(),photo,'application/octet-stream');expect(u.status).toBe(201);
    expect((await complete(t,p,{evidenceImageReference:u.reference})).status).toBe(400);
    expect((await complete(t,p,{evidenceCapturedAt:new Date().toISOString()})).status).toBe(400);
    expect((await complete(t,p,{evidenceImageReference:u.reference,evidenceCapturedAt:new Date().toISOString()})).status).toBe(201);
    const log=await db.query<Array<{new_value:object}>>("SELECT new_value FROM configuration_audit_logs WHERE resource_id=$1 AND action IN ('MEMBER_START','MEMBER_COMPLETE')",[t.id]);
    expect(JSON.stringify(log)).not.toMatch(/latitude|longitude|106/);
  });
  it('allows only one owner when different accounts simultaneously claim an image UUID',async()=>{
    const p=await actor(),q=await actor(),id=randomUUID(),results=await Promise.all([upload(p,id),upload(q,id)]);expect(results.map(r=>r.status).sort()).toEqual([201,400]);
    const winner=results[0].status===201?p:q,loser=winner===p?q:p,ref=results.find(r=>r.status===201)!.reference;
    expect((await image(winner,ref)).status).toBe(200);expect((await image(loser,ref)).status).toBe(404);
  });
  it('deletes both unattached and linked employee trip uploads but preserves shared trip and other member',async()=>{
    const p=await actor(),q=await actor(),linked=await upload(p),unused=await upload(p),t=await trip([p,q],{requiresPhoto:true});await assign(t);expect((await start(t,p)).status).toBe(201);expect((await complete(t,p,{evidenceImageReference:linked.reference,evidenceCapturedAt:new Date().toISOString()})).status).toBe(201);
    const impact=await call<{employeeCode:string;confirmationToken:string;counts:Record<string,number>}>(`/employees/${p.employeeId}/deletion-impact`);expect(impact.status).toBe(200);expect(impact.body.counts.business_trip_evidence_uploads).toBe(2);
    expect((await call(`/employees/${p.employeeId}`,'DELETE',{employeeCode:impact.body.employeeCode,confirmationToken:impact.body.confirmationToken,reason:label})).status).toBe(200);
    expect(await db.query('SELECT evidence_id FROM business_trip_evidence_uploads WHERE uploaded_by=$1',[p.id])).toHaveLength(0);
    for(const ref of [linked.reference,unused.reference]) expect((await image(admin,ref)).status).toBe(404);
    expect(await db.query('SELECT id FROM business_trips WHERE id=$1',[t.id])).toHaveLength(1);expect(await db.query('SELECT employee_id FROM business_trip_members WHERE business_trip_id=$1',[t.id])).toEqual([{employee_id:q.employeeId}]);
  });
  it('backfills unambiguous legacy ownership without changing links; ambiguous history stays Admin-only and rollback refuses usage',async()=>{
    const legacyName=`r8_trips_test_${randomUUID().replaceAll('-','')}`;const url=new URL(process.env.DATABASE_URL!);url.pathname=`/${legacyName}`;
    await maintenance.query(`CREATE DATABASE "${legacyName}"`);
    const {applicationDataSource}=await import('../src/database/data-source.js');
    if(applicationDataSource.options.type!=='postgres') throw new Error('PostgreSQL required');
    const legacy=new DataSource({...applicationDataSource.options,url:url.toString(),migrations:(applicationDataSource.options.migrations as Array<typeof BusinessTripEvidenceOwnership1792713600000>).filter(m=>m!==BusinessTripEvidenceOwnership1792713600000)});
    try {
      await legacy.initialize();await legacy.runMigrations();
      const u=randomUUID(),v=randomUUID(),e=randomUUID(),f=randomUUID(),t=randomUUID(),a=randomUUID(),b=randomUUID();
      await legacy.query("INSERT INTO users(id,email,password_hash) VALUES($1,'r8-old-a@development.invalid','NOT_A_CREDENTIAL'),($2,'r8-old-b@development.invalid','NOT_A_CREDENTIAL')",[u,v]);
      await legacy.query('INSERT INTO employees(id,employee_code,full_name,user_id) VALUES($1,$2,$3,$4),($5,$6,$3,$7)',[e,e.slice(0,28),label,u,f,f.slice(0,28),v]);
      await legacy.query("INSERT INTO business_trips(id,code,site_name,site_address,start_at,end_at,content,created_by) VALUES($1,'R8-LEGACY',$2::text,$2::text,now(),now()+interval '1 hour',$2::text,$3)",[t,label,u]);
      await legacy.query('INSERT INTO business_trip_members(business_trip_id,employee_id,evidence_image_reference) VALUES($1,$2,$3),($1,$4,$5)',[t,e,`/api/business-trips/evidence/${a}.png`,f,`/api/business-trips/evidence/${b}.jpg`]);
      const second=randomUUID();await legacy.query("INSERT INTO business_trips(id,code,site_name,site_address,start_at,end_at,content,created_by) VALUES($1,'R8-LEGACY-2',$2::text,$2::text,now(),now()+interval '1 hour',$2::text,$3)",[second,label,u]);
      await legacy.query('INSERT INTO business_trip_members(business_trip_id,employee_id,evidence_image_reference) VALUES($1,$2,$3)',[second,e,`/api/business-trips/evidence/${b}.jpg`]);
      const runner=legacy.createQueryRunner();await runner.connect();
      try {const migration=new BusinessTripEvidenceOwnership1792713600000();await migration.up(runner);expect(await legacy.query('SELECT evidence_id,uploaded_by FROM business_trip_evidence_uploads ORDER BY evidence_id')).toEqual([{evidence_id:a,uploaded_by:u},{evidence_id:b,uploaded_by:null}].sort((x,y)=>x.evidence_id.localeCompare(y.evidence_id)));await expect(migration.down(runner)).rejects.toThrow('TRIP_EVIDENCE_OWNERSHIP_IN_USE');}
      finally{await runner.release();}
      expect(await legacy.query('SELECT employee_id FROM business_trip_members')).toHaveLength(3);
    }finally{if(legacy.isInitialized)await legacy.destroy();if(/^r8_trips_test_[a-f0-9]{32}$/.test(legacyName))await maintenance.query(`DROP DATABASE "${legacyName}"`);}
  },30_000);
});
