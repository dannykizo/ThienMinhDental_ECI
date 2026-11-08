import 'reflect-metadata';
import { createHash, generateKeyPairSync, type KeyObject, randomUUID, sign } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

interface Actor { id: string; employeeId: string; token: string; privateKey: KeyObject }
interface Capture { id: string; serverTime: string; attendanceType: string }
const label = 'R4 capture development-only acceptance';
const gps = { latitude: 10, longitude: 106, accuracyMeters: 5, mockLocationSignal: false };
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');

describe.skipIf(process.env.R4_POSTGRES_TEST !== '1')('R4 daily office/field attendance — isolated PostgreSQL/API', () => {
  const name = `r4_capture_test_${randomUUID().replaceAll('-','')}`;
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
    storage = await mkdtemp(join(tmpdir(),'r4-capture-evidence-'));
    const [b] = await db.query<Array<{ id: string }>>(`INSERT INTO branches(code,name) VALUES('R4-CAPTURE',$1) RETURNING id`,[label]); branch = b.id;
    const [d] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES('R4-CAPTURE',$1) RETURNING id`,[label]); department = d.id;
    await db.query(`INSERT INTO office_locations(name,address,latitude,longitude,radius_meters,accuracy_threshold_meters,branch_id) VALUES($1,$1,10,106,100,50,$2)`,[label,branch]);
    const probe = createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done,reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath,[process.env.R6_API_ENTRY ?? 'dist/main.js'],{ stdio:'ignore',env:{ ...process.env,DATABASE_URL:url.toString(),PORT:String(port),JWT_SECRET:secret,EVIDENCE_STORAGE_DIR:storage,
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
    if (created && maintenance?.isInitialized && /^r4_capture_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(storage) === tmpdir() && basename(storage).startsWith('r4-capture-evidence-')) await rm(storage,{ recursive:true,force:true });
  },15_000);
  async function actor(role: RoleCode = RoleCode.Employee): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`,[`r4-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2',[u.id,role]);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES($1,$2,$3,$4) RETURNING id`,[randomUUID().slice(0,28),label,u.id,department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`,[e.id,branch,department]);
    const deviceId = randomUUID(), keys = generateKeyPairSync('ec',{namedCurve:'prime256v1'}), publicKey = keys.publicKey.export({type:'spki',format:'pem'}).toString();
    await db.query(`INSERT INTO attendance_devices(user_id,employee_id,device_id,device_name,public_key,fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE')`,[u.id,e.id,deviceId,label,publicKey,createHash('sha256').update(publicKey).digest('hex')]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`,[u.id,deviceId,label]);
    return { id:u.id,employeeId:e.id,token:await jwt.signAsync({ sub:u.id,sid:s.id,roles:[RoleCode.Admin] },{ expiresIn:900 }),privateKey:keys.privateKey };
  }
  async function call<T = Record<string,unknown>>(path: string, method = 'GET', body?: unknown, who = admin): Promise<{ status:number; body:T }> {
    const r = await fetch(`${api}${path}`,{ method,headers:{ Authorization:`Bearer ${who.token}`,...(body === undefined ? {} : { 'Content-Type':'application/json' }) },body:body === undefined ? undefined : JSON.stringify(body) });
    return { status:r.status,body:await r.json() as T };
  }
  async function prepare(p: Actor, type = 'OFFICE'): Promise<Capture> {
    const r = await call<Capture>('/attendance/check-in-captures','POST',{ ...gps,attendanceType:type,...(type === 'BUSINESS_TRIP' ? { fieldWorkContent:label } : {}) },p);
    expect(r.status).toBe(201); return r.body;
  }
  async function upload(p: Actor, id: string, bytes = photo): Promise<{ status:number; body:Record<string,unknown> }> {
    const form = new FormData(); form.set('evidenceId',id); form.set('file',new Blob([new Uint8Array(bytes)],{ type:'image/png' }),'capture.png');
    const r = await fetch(`${api}/attendance/evidence`,{ method:'POST',headers:{ Authorization:`Bearer ${p.token}` },body:form });
    return { status:r.status,body:await r.json() as Record<string,unknown> };
  }
  async function signed(p:Actor,input:Record<string,unknown>): Promise<Record<string,unknown>> {
    const c = await call('/attendance/device-challenges','POST',input,p); expect(c.status).toBe(201);
    return {...input,challengeId:c.body.id,signature:sign('sha256',Buffer.from(c.body.payload as string),p.privateKey).toString('base64')};
  }
  async function record(p:Actor,type:string,eventType:string,capture?:string,extra = {}): Promise<{status:number;body:Record<string,unknown>}> {
    return call('/attendance/events','POST',await signed(p,{...gps,attendanceType:type,eventType,...(capture ? {checkinCaptureId:capture} : {}),...extra}),p);
  }
  async function checkIn(p: Actor,type = 'OFFICE'): Promise<Capture> { const c = await prepare(p,type); expect((await upload(p,c.id)).status).toBe(201); expect((await record(p,type,'CHECK_IN',c.id)).status).toBe(201); return c; }
  const date = (): string => new Date().toLocaleDateString('en-CA',{ timeZone:'Asia/Bangkok' });

  it('requires field content and valid mandatory GPS, rejects forged identity and missing check-in photo',async () => {
    const p = await actor();
    for (const extra of [{ attendanceType:'BUSINESS_TRIP' },{ accuracyMeters:null },{ latitude:'10' },{ fieldWorkContent:null },{ employeeId:p.employeeId }]) expect((await call('/attendance/check-in-captures','POST',{ ...gps,attendanceType:'OFFICE',...extra },p)).status).toBe(400);
    expect((await record(p,'OFFICE','CHECK_IN')).body.code).toBe('CHECK_IN_PHOTO_REQUIRED');
    expect((await record(p,'OFFICE','CHECK_OUT')).body.code).toBe('CHECK_IN_REQUIRED');
  });
  it('binds photos to the current actor, context, mode and sample; rejects expiry',async () => {
    const p = await actor(), other = await actor(), c = await prepare(p);
    expect((await record(p,'OFFICE','CHECK_IN',c.id)).body.code).toBe('CHECK_IN_PHOTO_REQUIRED');
    expect((await upload(other,c.id)).status).toBe(400);
    expect((await upload(p,c.id)).status).toBe(201);
    expect((await record(other,'OFFICE','CHECK_IN',c.id)).status).toBe(409);
    expect((await record(p,'BUSINESS_TRIP','CHECK_IN',c.id)).body.code).toBe('CHECK_IN_CAPTURE_MISMATCH');
    expect((await record(p,'OFFICE','CHECK_IN',c.id,{ latitude:11 })).status).toBe(400);
    await db.query(`UPDATE attendance_checkin_captures SET expires_at=now()-interval '1 second' WHERE id=$1`,[c.id]);
    expect((await record(p,'OFFICE','CHECK_IN',c.id)).body.code).toBe('CHECK_IN_CAPTURE_EXPIRED');
  });
  it('shares a single daily pair across both modes; checkout has no photo or location response',async () => {
    const p = await actor(); await checkIn(p);
    expect((await record(p,'BUSINESS_TRIP','CHECK_IN')).body.code).toBe('DAILY_CHECK_IN_LIMIT');
    expect((await record(p,'BUSINESS_TRIP','CHECK_OUT')).body.code).toBe('ATTENDANCE_TYPE_MISMATCH');
    const out = await record(p,'OFFICE','CHECK_OUT',undefined,{ latitude:10.01,longitude:106.01 });
    expect(out.status).toBe(201);
    expect(out.body).toMatchObject({ distanceMeters:null,officeLocationId:null,officeLocationName:null,accuracyMeters:null });
    expect(out.body).not.toHaveProperty('latitude'); expect(out.body).not.toHaveProperty('longitude');
    expect((await record(p,'OFFICE','CHECK_OUT')).body.code).toBe('DAILY_CHECK_OUT_LIMIT');
    expect((await record(p,'OFFICE','CHECK_IN')).body.code).toBe('DAILY_CHECK_IN_LIMIT');
    expect((await call('/attendance/me/today','GET',undefined,p)).body).toMatchObject({ status:'CHECKED_OUT',attendanceType:'OFFICE' });
  });
  it('records field work without a ticket or review; appears immediately in monthly/Excel even without a schedule',async () => {
    const p = await actor(); await checkIn(p,'BUSINESS_TRIP');
    let report = await call<Array<Record<string,unknown>>>(`/reporting/monthly?month=${date().slice(0,7)}&employeeId=${p.employeeId}`);
    expect(report.body.find(row => row.workDate === date())).toMatchObject({ status:'INCOMPLETE',attendanceType:'BUSINESS_TRIP' });
    expect((await record(p,'BUSINESS_TRIP','CHECK_OUT')).status).toBe(201);
    report = await call<Array<Record<string,unknown>>>(`/reporting/monthly?month=${date().slice(0,7)}&employeeId=${p.employeeId}`);
    expect(report.body.find(row => row.workDate === date())).toMatchObject({ status:'BUSINESS_TRIP',attendanceType:'BUSINESS_TRIP',overtimeMinutes:0,requiredWorkMinutes:480 });
    const excel = await fetch(`${api}/reporting/monthly/export?month=${date().slice(0,7)}&employeeId=${p.employeeId}`,{ headers:{ Authorization:`Bearer ${admin.token}` } });
    expect(excel.status).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await excel.arrayBuffer());
    const sheet = workbook.getWorksheet('Chi tiết ngày')!;
    expect(sheet.getCell('N1').value).toBe('Hình thức'); expect(sheet.getCell('N2').value).toBe('Hiện trường');
    expect(await db.query('SELECT business_trip_id,field_work_content FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toEqual([{ business_trip_id:null,field_work_content:label },{ business_trip_id:null,field_work_content:label }]);
  });
  it('only live Admin can read checkout GPS and field content; general APIs never expose it',async () => {
    const p = await actor(), other = await actor(); await checkIn(p,'BUSINESS_TRIP'); await record(p,'BUSINESS_TRIP','CHECK_OUT',undefined,{ latitude:11,longitude:107 });
    const path = `/attendance/daily/${p.employeeId}/details?date=${date()}`;
    expect((await call(path,'GET',undefined,p)).status).toBe(403);
    expect((await call(path,'GET',undefined,other)).status).toBe(403);
    const details = await call<Array<Record<string,unknown>>>(path);
    expect(details.body.find(e => e.eventType === 'CHECK_OUT')).toMatchObject({ latitude:11,longitude:107 });
    const daily = await call<Array<Record<string,unknown>>>(`/attendance/daily?date=${date()}`);
    expect(daily.body.find(e => e.employeeId === p.employeeId)).not.toHaveProperty('latitude');
    const mine = await call('/attendance/me/today','GET',undefined,p);
    expect(mine.body).not.toHaveProperty('latitude'); expect(mine.body).not.toHaveProperty('fieldWorkContent');
    expect((await call(`/attendance/daily/${p.employeeId}/details?date=2026-02-30`)).status).toBe(400);
  });
  it('serializes concurrent check-in and checkout; completed photo cannot be overwritten',async () => {
    const p = await actor(), c = await prepare(p); await upload(p,c.id);
    const entry = await signed(p,{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN',checkinCaptureId:c.id});
    const entered = await Promise.all([call('/attendance/events','POST',entry,p),call('/attendance/events','POST',entry,p)]);
    expect(entered.map(r => r.status).sort()).toEqual([201,409]);
    const exit = await signed(p,{...gps,attendanceType:'OFFICE',eventType:'CHECK_OUT'});
    const exited = await Promise.all([call('/attendance/events','POST',exit,p),call('/attendance/events','POST',exit,p)]);
    expect(exited.map(r => r.status).sort()).toEqual([201,409]);
    expect((await upload(p,c.id,Buffer.concat([photo,Buffer.from('different')]))).body.code).toBe('EVIDENCE_ALREADY_ATTACHED');
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toHaveLength(2);
  });
  it('keeps legacy history, forbids another same-day pair and allows a fresh day',async () => {
    const p = await actor();
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','BUSINESS_TRIP',now()-interval '1 day'),($1,'CHECK_OUT','BUSINESS_TRIP',now()-interval '1 day')`,[p.employeeId]);
    await checkIn(p);
    expect((await record(p,'OFFICE','CHECK_IN')).body.code).toBe('DAILY_CHECK_IN_LIMIT');
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1 AND NOT daily_policy',[p.employeeId])).toHaveLength(2);
  });
  it('deletes capture/event/photo ownership with employee deletion, without introducing a new FK blocker',async () => {
    const p = await actor(); await checkIn(p,'BUSINESS_TRIP'); await record(p,'BUSINESS_TRIP','CHECK_OUT');
    const impact = await call<{ counts:Record<string,number>; confirmationToken:string; employeeCode:string }>(`/employees/${p.employeeId}/deletion-impact`);
    expect(impact.body.counts.attendance_checkin_captures).toBe(1);
    const result = await call(`/employees/${p.employeeId}`,'DELETE',{ employeeCode:impact.body.employeeCode,confirmationToken:impact.body.confirmationToken,reason:label });
    expect(result.status).toBe(200);
    expect(await db.query('SELECT id FROM attendance_checkin_captures WHERE employee_id=$1',[p.employeeId])).toEqual([]);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toEqual([]);
  });
  it('ticket lifecycle keeps working but never adds implicit daily check-in/out',async () => {
    const p = await actor(); await checkIn(p,'BUSINESS_TRIP'); await record(p,'BUSINESS_TRIP','CHECK_OUT');
    const [trip] = await db.query<Array<{ id:string }>>(`INSERT INTO business_trips(code,site_name,site_address,start_at,end_at,content,status,created_by,responsible_employee_id,requires_photo) VALUES($1,$2::text,$2::text,now(),now()+interval '1 day',$2::text,'ASSIGNED',$3,$4,false) RETURNING id`,[randomUUID().slice(0,28),label,admin.id,p.employeeId]);
    await db.query(`INSERT INTO business_trip_members(business_trip_id,employee_id,participation_status) VALUES($1,$2,'ASSIGNED')`,[trip.id,p.employeeId]);
    const tripGps = { latitude:gps.latitude,longitude:gps.longitude,accuracyMeters:gps.accuracyMeters };
    expect((await call(`/business-trips/${trip.id}/start`,'POST',tripGps,p)).status).toBe(201);
    expect((await call(`/business-trips/${trip.id}/complete`,'POST',tripGps,p)).status).toBe(201);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toHaveLength(2);
    expect((await db.query<Array<{ status:string }>>('SELECT status FROM business_trips WHERE id=$1',[trip.id]))[0].status).toBe('COMPLETED');
  });
});
