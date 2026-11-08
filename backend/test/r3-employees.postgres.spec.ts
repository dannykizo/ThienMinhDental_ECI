import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/bcrypt-password-hasher.js';
import { TypeOrmAuthSessionRepository } from '../src/modules/auth/infrastructure/typeorm-auth-session.repository.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

interface Actor { id: string; employeeId: string; token: string; username: string }
interface Impact { employeeCode: string; confirmationToken: string; counts: Record<string,number> }
interface Login { accessToken: string; refreshToken: string }
const reason = 'R3 Development-only acceptance';

// Explicit R3 acceptance only; never mutate customer/dev personnel or send push/email.
describe.skipIf(process.env.R3_POSTGRES_TEST !== '1')('R3 employees/accounts — isolated PostgreSQL and HTTP', () => {
  const name = `r3_employees_test_${randomUUID().replaceAll('-','')}`;
  const secret = randomUUID().repeat(2), password = randomUUID();
  const hasher = new BcryptPasswordHasher(), jwt = new JwtService({ secret, signOptions: { expiresIn: 900 } });
  let maintenance: DataSource, db: DataSource, created = false, apiProcess: ChildProcess | undefined;
  let api = '', root = '', passwordHash = '', branch = '', department = '';

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^r3_employees_test_[a-f0-9]{32}$/.test(name) || url.pathname === `/${name}`) throw new Error('R3 requires an owned local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    passwordHash = await hasher.hash(password);
    const [b] = await db.query<Array<{id:string}>>(`INSERT INTO branches(code,name) VALUES('R3-DEV','R3 Development only') RETURNING id`); branch = b.id;
    const [d] = await db.query<Array<{id:string}>>(`INSERT INTO departments(code,name) VALUES('R3-DEV','R3 Development only') RETURNING id`); department = d.id;
    root = await mkdtemp(join(tmpdir(),'r3-evidence-'));
    const probe = createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done,reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    apiProcess = spawn(process.execPath,['dist/main.js'], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000',
      EVIDENCE_STORAGE_DIR: join(root,'attendance'), BUSINESS_TRIP_EVIDENCE_STORAGE_DIR: join(root,'trips'),
    } });
    for (let i=0;i<200;i++) { if (apiProcess.exitCode!==null) throw new Error('Build Backend before R3 acceptance'); if (await fetch(`${api}/health`).then(r=>r.ok).catch(()=>false)) return; await delay(100); }
    throw new Error('R3 isolated API readiness timeout');
  },30_000);
  afterAll(async () => {
    if (apiProcess && apiProcess.exitCode===null) { const exited=once(apiProcess,'exit'); apiProcess.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r3_employees_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (root && dirname(resolve(root))===resolve(tmpdir()) && basename(root).startsWith('r3-evidence-')) await rm(root,{recursive:true,force:true});
  },15_000);
  async function call<T=Record<string,unknown>>(actor: Actor, path: string, method='GET', body?:unknown): Promise<{status:number;body:T}> {
    const response=await fetch(`${api}${path}`,{method,headers:{Authorization:`Bearer ${actor.token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as T};
  }
  async function actor(role: RoleCode=RoleCode.Employee): Promise<Actor> {
    const username=`r3-${randomUUID()}@development.invalid`;
    const [u]=await db.query<Array<{id:string}>>('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',[username,passwordHash]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2',[u.id,role]);
    const [e]=await db.query<Array<{id:string}>>(`INSERT INTO employees(employee_code,full_name,user_id,phone,department_id) VALUES($1,$2,$3,'R3-PRIVATE',$4) RETURNING id`,[randomUUID().slice(0,28),reason,u.id,department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`,[e.id,branch,department]);
    const [s]=await db.query<Array<{id:string}>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status,refresh_token_hash) VALUES($1,$2,'R3 Development only','MOBILE',now()+interval '1 day','SKIPPED','OLD-CREDENTIAL') RETURNING id`,[u.id,randomUUID()]);
    // Intentional forged ADMIN claim: live DB roles must win.
    return {id:u.id,employeeId:e.id,username,token:await jwt.signAsync({sub:u.id,sid:s.id,roles:[RoleCode.Admin]})};
  }
  function input(extra:Record<string,unknown>={}):Record<string,unknown> { return {employeeCode:randomUUID().slice(0,28),fullName:reason,employeeType:'OFFICE',hireDate:'2020-01-01',organizationAssignments:[{branchId:branch,departmentId:department,isPrimary:true}],...extra}; }
  async function login(username:string, suppliedPassword:string=password):Promise<{status:number;body:Login}> {
    const response=await fetch(`${api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:username,password:suppliedPassword,deviceId:randomUUID(),deviceName:'R3 Development-only',clientType:'MOBILE'})});
    return {status:response.status,body:await response.json() as Login};
  }
  async function impact(admin:Actor, employee:Actor):Promise<Impact> {const r=await call<Impact>(admin,`/employees/${employee.employeeId}/deletion-impact`); expect(r.status).toBe(200);return r.body;}
  async function purge(admin:Actor, employee:Actor, snapshot?:Impact):Promise<{status:number;body:Record<string,unknown>}> {
    const x=snapshot??await impact(admin,employee);return call(admin,`/employees/${employee.employeeId}`,'DELETE',{employeeCode:x.employeeCode,confirmationToken:x.confirmationToken,reason});
  }

  it('creates a normalized account/profile without returning hash or plaintext; permits profile-only creation',async()=>{
    const admin=await actor(RoleCode.Admin), email=`R3-${randomUUID()}@DEVELOPMENT.INVALID`, code=randomUUID().slice(0,28).toLowerCase();
    const result=await call<{id:string;userId:string}>(admin,'/employees','POST',input({employeeCode:` ${code} `,email,temporaryPassword:'abc123'}));
    expect(result.status).toBe(201);expect(JSON.stringify(result.body)).not.toMatch(/password|abc123/i);
    const [u]=await db.query<Array<{email:string;password_hash:string}>>('SELECT email,password_hash FROM users WHERE id=$1',[result.body.userId]);
    expect(u.email).toBe(email.toLowerCase());expect(await hasher.compare('abc123',u.password_hash)).toBe(true);
    expect((await login(email,'abc123')).status).toBe(200);
    const account=await call(admin,`/employees/${result.body.id}/account`);expect(JSON.stringify(account.body)).not.toMatch(/hash|password|abc123/i);
    expect((await call(admin,'/employees','POST',input())).status).toBe(201);
  });
  it('rejects duplicate code/email atomically without orphan users',async()=>{
    const admin=await actor(RoleCode.Admin), code=randomUUID().slice(0,28);
    expect((await call(admin,'/employees','POST',input({employeeCode:code}))).status).toBe(201);
    const email=`r3-${randomUUID()}@development.invalid`;
    expect((await call(admin,'/employees','POST',input({employeeCode:code,email,temporaryPassword:'abc123'}))).status).toBe(409);
    expect(await db.query('SELECT id FROM users WHERE email=$1',[email])).toEqual([]);
    expect((await call(admin,'/employees','POST',input({email:admin.username,temporaryPassword:'abc123'}))).status).toBe(409);
  });
  it('rejects blank identities, incomplete account fields and invalid primary assignments',async()=>{
    const admin=await actor(RoleCode.Admin);
    for (const extra of [{employeeCode:'  '},{fullName:'  '},{email:'r3-incomplete@development.invalid'},{temporaryPassword:'abc123'},
      {organizationAssignments:[{branchId:branch,departmentId:department,isPrimary:false}]},
      {organizationAssignments:[{branchId:branch,departmentId:department,isPrimary:true},{branchId:branch,departmentId:department,isPrimary:true}]}]) expect((await call(admin,'/employees','POST',input(extra))).status).toBe(400);
  });
  it('scopes the basic directory and keeps contacts/account/hash in ADMIN detail only',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor(), accountant=await actor(RoleCode.ChiefAccountant), area=await actor(RoleCode.AreaManager);
    const shared=await call<Array<Record<string,unknown>>>(accountant,'/employees');expect(shared.status).toBe(200);
    const row=shared.body.find(e=>e.id===target.employeeId)!;expect(row.phone).toBeUndefined();expect(row.accountEmail).toBeNull();expect(JSON.stringify(row)).not.toContain(target.username);
    expect((await call(area,'/employees')).body).toEqual([]);
    await db.query('INSERT INTO user_branch_scopes(user_id,branch_id) VALUES($1,$2)',[area.id,branch]);
    expect((await call<Array<{id:string}>>(area,'/employees')).body.map(e=>e.id)).toContain(target.employeeId);
    expect((await call(admin,`/employees/${target.employeeId}`)).body.accountEmail).toBe(target.username);
    expect((await call(accountant,`/employees/${target.employeeId}`)).status).toBe(403);
  });
  it('supports edit/history and rejects a non-ADMIN forged role on every sensitive operation',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor();
    const updated=await call(admin,`/employees/${target.employeeId}`,'PATCH',{fullName:'R3 Development-only edited'});expect(updated.status).toBe(200);
    expect((await call(admin,`/employees/${target.employeeId}`,'PATCH',{fullName:'   '})).status).toBe(400);
    expect((await call<{events:Array<{action:string}>}>(admin,`/employees/${target.employeeId}/history`)).body.events.some(e=>e.action==='UPDATED')).toBe(true);
    for(const [path,method,body] of [[`/employees/${target.employeeId}/account`,'GET',undefined],[`/employees/${target.employeeId}/deletion-impact`,'GET',undefined],
      [`/employees/${target.employeeId}/account/reset-password`,'POST',{newPassword:'abc123',reason}],[`/employees/${target.employeeId}`,'DELETE',{}],
      [`/employees/${target.employeeId}`,'PATCH',{fullName:reason}],[`/employees/${target.employeeId}/status`,'PATCH',{isActive:false,effectiveDate:'2026-01-01',reason}]] as const) expect((await call(target,path,method,body)).status).toBe(403);
  });
  it('reset changes only the hash, invalidates access/refresh and push, does not log credentials',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor(), session=await login(target.username);
    target.token=session.body.accessToken;
    await db.query(`INSERT INTO push_device_tokens(user_id,employee_id,device_id,platform,token,is_active) VALUES($1,$2,'r3-device','ANDROID',$3,true)`,[target.id,target.employeeId,randomUUID()]);
    const result=await call(admin,`/employees/${target.employeeId}/account/reset-password`,'POST',{newPassword:'xyz456',reason});expect(result.status).toBe(201);
    expect(JSON.stringify(result.body)).not.toContain('xyz456');
    expect((await call(target,'/auth/me')).status).toBe(401);expect((await login(target.username)).status).toBe(401);
    const refresh=await fetch(`${api}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.body.refreshToken})});expect(refresh.status).toBe(401);
    const [push]=await db.query<Array<{is_active:boolean}>>('SELECT is_active FROM push_device_tokens WHERE user_id=$1',[target.id]);expect(push.is_active).toBe(false);
    const audits=await db.query<Array<{new_value:unknown}>>(`SELECT new_value FROM configuration_audit_logs WHERE resource_id=$1 AND action='PASSWORD_RESET'`,[target.employeeId]);
    expect(audits).toHaveLength(1);expect(JSON.stringify(audits)).not.toMatch(/xyz456|passwordHash|password_hash/);
    expect((await login(target.username,'xyz456')).status).toBe(200);
  });
  it('rejects old-password verification after reset while holding the account lock',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor();
    await call(admin,`/employees/${target.employeeId}/account/reset-password`,'POST',{newPassword:'xyz456',reason});
    const sessions=new TypeOrmAuthSessionRepository(db);
    await expect(sessions.replaceActiveSession(target.id,{deviceId:randomUUID(),deviceName:reason,clientType:'MOBILE',ipAddress:null,userAgent:null},new Date(Date.now()+60_000),'unused-refresh-hash',passwordHash)).rejects.toThrow('Mật khẩu đã thay đổi');
    expect(await db.query('SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[target.id])).toEqual([]);
  });
  it('reset does not reactivate inactive personnel and rejects weak/blank-reason/no-account resets',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor();
    for(const payload of [{newPassword:'short',reason},{newPassword:'xyz456',reason:'     '}]) expect((await call(admin,`/employees/${target.employeeId}/account/reset-password`,'POST',payload)).status).toBe(400);
    expect((await call(admin,`/employees/${target.employeeId}/status`,'PATCH',{isActive:false,effectiveDate:'2026-01-01',reason})).status).toBe(200);
    expect((await call(admin,`/employees/${target.employeeId}/account/reset-password`,'POST',{newPassword:'xyz456',reason})).status).toBe(201);
    expect((await login(target.username,'xyz456')).status).toBe(401);
    const e=await call<{id:string}>(admin,'/employees','POST',input());
    expect((await call(admin,`/employees/${e.body.id}/account/reset-password`,'POST',{newPassword:'xyz456',reason})).status).toBe(400);
  });
  it('inactive/restore preserve history but never revive old sessions or push tokens',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor();
    const payload={effectiveDate:'2026-01-01',reason};
    expect((await call(admin,`/employees/${target.employeeId}/status`,'PATCH',{...payload,isActive:false})).status).toBe(200);
    expect((await call(target,'/auth/me')).status).toBe(401);
    expect((await call(admin,`/employees/${target.employeeId}/status`,'PATCH',{...payload,isActive:false})).status).toBe(409);
    expect((await call(admin,`/employees/${target.employeeId}/status`,'PATCH',{...payload,isActive:true})).status).toBe(200);
    expect((await call(target,'/auth/me')).status).toBe(401);
    expect((await login(target.username)).status).toBe(200);
    expect((await call<{events:unknown[]}>(admin,`/employees/${target.employeeId}/history`)).body.events).toHaveLength(2);
  });
  it('requires exact employee code, reason and fresh impact; stale writes leave all data intact',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor(), x=await impact(admin,target);
    expect((await call(admin,`/employees/${target.employeeId}`,'DELETE',{employeeCode:'WRONG',confirmationToken:x.confirmationToken,reason})).status).toBe(400);
    expect((await call(admin,`/employees/${target.employeeId}`,'DELETE',{employeeCode:x.employeeCode,confirmationToken:x.confirmationToken,reason:'     '})).status).toBe(400);
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','OFFICE',now())`,[target.employeeId]);
    expect((await purge(admin,target,x)).status).toBe(409);
    expect((await call(admin,`/employees/${target.employeeId}`)).status).toBe(200);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[target.employeeId])).toHaveLength(1);
  });
  it('deletes used personnel even in locked periods, without deleting shared trips/other employees; anonymizes historical actor',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor(), other=await actor();
    await db.query(`INSERT INTO attendance_periods(period_month,status,locked_by,locked_at) VALUES('2020-01-01','LOCKED',$1,now())`,[admin.id]);
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','OFFICE','2020-01-02T01:00:00Z')`,[target.employeeId]);
    await db.query(`INSERT INTO attendance_adjustments(employee_id,work_date,field_name,new_value,reason,adjusted_by) VALUES($1,'2020-01-02','status','"PRESENT"',$2,$3)`,[target.employeeId,reason,admin.id]);
    await db.query(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,reason,policy_id,status) SELECT $1,'OTHER','2020-01-03','2020-01-03',$2,id,'APPROVED' FROM leave_policies WHERE code='OTHER'`,[target.employeeId,reason]);
    await db.query(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,status,requested_by,source,submitted_by,submission_id) VALUES($1,'2020-01-02','OTHER',$2,'SUBMITTED',NULL,'EMPLOYEE',$3,$4)`,[target.employeeId,reason,target.id,randomUUID()]);
    const [trip]=await db.query<Array<{id:string}>>(`INSERT INTO business_trips(code,site_name,site_address,start_at,end_at,content,created_by,responsible_employee_id) VALUES($1,$2::text,$2::text,now(),now()+interval '1 day',$2::text,$3,$4) RETURNING id`,[randomUUID().slice(0,28),reason,target.id,target.employeeId]);
    await db.query('INSERT INTO business_trip_members(business_trip_id,employee_id) VALUES($1,$2),($1,$3)',[trip.id,target.employeeId,other.employeeId]);
    await db.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,created_by) VALUES('BUSINESS_TRIP',$1,'CREATED',$2)`,[trip.id,target.id]);
    const x=await impact(admin,target);expect(x.counts.attendance_events).toBe(1);expect(x.counts.leave_requests).toBe(1);
    expect((await purge(admin,target,x)).status).toBe(200);
    expect((await call(admin,`/employees/${target.employeeId}`)).status).toBe(404);expect((await call(target,'/auth/me')).status).toBe(401);
    for (const table of ['attendance_events','attendance_adjustments','attendance_explanation_requests','leave_requests','employee_organization_assignments','business_trip_members']) expect(await db.query(`SELECT * FROM ${table} WHERE employee_id=$1`,[target.employeeId])).toEqual([]);
    expect(await db.query('SELECT employee_id FROM business_trip_members WHERE business_trip_id=$1',[trip.id])).toEqual([{employee_id:other.employeeId}]);
    expect(await db.query('SELECT responsible_employee_id FROM business_trips WHERE id=$1',[trip.id])).toEqual([{responsible_employee_id:null}]);
    const [u]=await db.query<Array<{email:string;is_active:boolean;password_hash:string}>>('SELECT email,is_active,password_hash FROM users WHERE id=$1',[target.id]);
    expect(u).toEqual({email:`deleted-${target.id}@deleted.invalid`,is_active:false,password_hash:'DELETED_NOT_A_CREDENTIAL'});
    expect(await db.query('SELECT * FROM user_roles WHERE user_id=$1',[target.id])).toEqual([]);
    expect((await login(target.username)).status).toBe(401);
    expect(await db.query(`SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action='DELETED'`,[target.employeeId])).toHaveLength(1);
    expect(await db.query('SELECT created_by FROM configuration_audit_logs WHERE resource_id=$1',[trip.id])).toEqual([{created_by:target.id}]);
  });
  it('removes individual announcements, disciplinary/balance children and evidence files through the durable queue',async()=>{
    const admin=await actor(RoleCode.Admin), target=await actor(), filename=`${randomUUID()}.png`;
    await mkdir(join(root,'attendance'),{recursive:true});await writeFile(join(root,'attendance',filename),Buffer.from('R3 owned fixture'));
    await db.query('INSERT INTO attendance_evidence_uploads(evidence_id,filename,uploaded_by) VALUES($1,$2,$3)',[filename.slice(0,36),filename,target.id]);
    const [a]=await db.query<Array<{id:string}>>(`INSERT INTO announcements(title,body,audience_type,employee_id,created_by) VALUES($1::text,$1::text,'EMPLOYEE',$2,$3) RETURNING id`,[reason,target.employeeId,admin.id]);
    await db.query('INSERT INTO announcement_recipients(announcement_id,employee_id) VALUES($1,$2)',[a.id,target.employeeId]);
    await db.query(`INSERT INTO employee_disciplinary_actions(employee_id,action_type,title,reason,decision,effective_from,created_by,announcement_id) VALUES($1,'WARNING',$2::text,$2::text,$2::text,'2020-01-01',$3,$4)`,[target.employeeId,reason,admin.id,a.id]);
    const [balance]=await db.query<Array<{id:string}>>(`INSERT INTO employee_leave_balances(employee_id,policy_id,balance_year,entitlement_minutes) SELECT $1,id,2020,480 FROM leave_policies WHERE code='OTHER' RETURNING id`,[target.employeeId]);
    await db.query('INSERT INTO leave_balance_adjustments(balance_id,delta_minutes,reason,created_by) VALUES($1,480,$2,$3)',[balance.id,reason,admin.id]);
    const result=await purge(admin,target);expect(result.status).toBe(200);expect(result.body.evidenceCleanupPending).toBe(0);
    await expect(readFile(join(root,'attendance',filename))).rejects.toMatchObject({code:'ENOENT'});
    expect(await db.query('SELECT id FROM announcements WHERE id=$1',[a.id])).toEqual([]);
    expect(await db.query('SELECT id FROM leave_balance_adjustments WHERE balance_id=$1',[balance.id])).toEqual([]);
    expect(await db.query('SELECT * FROM employee_file_cleanup')).toEqual([]);
    // Legacy shared evidence must remain for a different employee's request.
    const target2=await actor(),other=await actor(),sharedFilename=`${randomUUID()}.png`;
    await writeFile(join(root,'attendance',sharedFilename),Buffer.from('R3 shared legacy fixture'));
    await db.query('INSERT INTO attendance_evidence_uploads(evidence_id,filename,uploaded_by) VALUES($1,$2,$3)',[sharedFilename.slice(0,36),sharedFilename,target2.id]);
    for(const person of [target2,other]) await db.query(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,status,source,submitted_by,submission_id,evidence_image_reference)
      VALUES($1,'2026-01-02','OTHER',$2,'SUBMITTED','EMPLOYEE',$3,$4,$5)`,[person.employeeId,reason,person.id,randomUUID(),`/api/attendance/evidence/${sharedFilename}`]);
    // External reference with a matching basename must not delete a local file
    // that belongs to another participant.
    const tripFilename=`${randomUUID()}.png`;
    await mkdir(join(root,'trips'),{recursive:true});await writeFile(join(root,'trips',tripFilename),Buffer.from('R3 other participant image'));
    const [externalTrip]=await db.query<Array<{id:string}>>(`INSERT INTO business_trips(code,site_name,site_address,start_at,end_at,content,created_by) VALUES($1,$2::text,$2::text,now(),now()+interval '1 day',$2::text,$3) RETURNING id`,[randomUUID().slice(0,28),reason,admin.id]);
    await db.query(`INSERT INTO business_trip_members(business_trip_id,employee_id,evidence_image_reference) VALUES($1,$2,$4),($1,$3,$5)`,[externalTrip.id,target2.employeeId,other.employeeId,`https://external.development.invalid/${tripFilename}`,`/api/business-trips/evidence/${tripFilename}`]);
    expect((await purge(admin,target2)).status).toBe(200);
    expect(await readFile(join(root,'attendance',sharedFilename))).toEqual(Buffer.from('R3 shared legacy fixture'));
    expect(await db.query('SELECT filename FROM attendance_evidence_uploads WHERE filename=$1',[sharedFilename])).toHaveLength(1);
    expect(await db.query('SELECT id FROM attendance_explanation_requests WHERE employee_id=$1',[other.employeeId])).toHaveLength(1);
    expect(await readFile(join(root,'trips',tripFilename))).toEqual(Buffer.from('R3 other participant image'));
  });
  it('allows deleting profile-only personnel and confirms self-reset/self-delete will invalidate the Admin session',async()=>{
    const admin=await actor(RoleCode.Admin), row=await call<{id:string}>(admin,'/employees','POST',input());
    const x=await call<Impact>(admin,`/employees/${row.body.id}/deletion-impact`);
    expect((await call(admin,`/employees/${row.body.id}`,'DELETE',{employeeCode:x.body.employeeCode,confirmationToken:x.body.confirmationToken,reason})).status).toBe(200);
    const reset=await call(admin,`/employees/${admin.employeeId}/account/reset-password`,'POST',{newPassword:'xyz456',reason});
    expect(reset.status).toBe(201);expect(reset.body.currentAccountInvalidated).toBe(true);
    admin.token=(await login(admin.username,'xyz456')).body.accessToken;
    const deleted=await purge(admin,admin);expect(deleted.status).toBe(200);expect(deleted.body.currentAccountInvalidated).toBe(true);
    expect((await call(admin,'/auth/me')).status).toBe(401);
  });
  it('concurrent duplicate deletions commit exactly once with one audit',async()=>{
    const admin=await actor(RoleCode.Admin),target=await actor(),x=await impact(admin,target);
    const results=await Promise.all([purge(admin,target,x),purge(admin,target,x)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,404]);
    expect(await db.query(`SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action='DELETED'`,[target.employeeId])).toHaveLength(1);
  });
  it('deleting a manager removes its memberships/grants but preserves others confirmed steps and enables Admin fallback',async()=>{
    const admin=await actor(RoleCode.Admin),head=await actor(),leader=await actor(),owner=await actor();
    const [team]=await db.query<Array<{id:string}>>(`INSERT INTO organization_teams(department_id,code,name,created_by) VALUES($1,$2,$3,$4) RETURNING id`,[department,randomUUID().slice(0,28).toUpperCase(),reason,admin.id]);
    await db.query(`INSERT INTO organization_team_memberships(team_id,employee_id,created_by) VALUES($1,$2,$4),($1,$3,$4)`,[team.id,head.employeeId,owner.employeeId,admin.id]);
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL','2020-01-01',$3,$4)`,[head.id,department,reason,admin.id]);
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,team_id,appointment_type,valid_from,reason,created_by) VALUES($1,'TEAM_LEADER',$2,'OFFICIAL','2020-01-01',$3,$4)`,[leader.id,team.id,reason,admin.id]);
    await db.query(`UPDATE employee_organization_assignments SET manager_employee_id=$1 WHERE employee_id=$2`,[head.employeeId,owner.employeeId]);
    for(const table of ['attendance_explanation_routes','leave_approval_routes']) await db.query(`INSERT INTO ${table}(employee_id,team_id,leader_user_id,head_user_id,reason,updated_by) VALUES($1,$2,$3,$4,$5,$6)`,[owner.employeeId,team.id,leader.id,head.id,reason,admin.id]);
    const [explanation]=await db.query<Array<{id:string}>>(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,status,source,submitted_by,submission_id,workflow_team_id,leader_user_id,head_user_id,approval_stage,confirmed_by,confirmed_at,route_version)
      VALUES($1,'2026-01-02','OTHER',$2,'SUBMITTED','EMPLOYEE',$3,$4,$5,$6,$7,'HEAD_APPROVAL',$6,'2026-01-03T00:00:00Z',1) RETURNING id`,[owner.employeeId,reason,owner.id,randomUUID(),team.id,leader.id,head.id]);
    const [leave]=await db.query<Array<{id:string}>>(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,reason,policy_id,submitted_by,workflow_team_id,leader_user_id,head_user_id,approval_stage,confirmed_by,confirmed_at,route_version)
      SELECT $1,'OTHER','2026-01-02','2026-01-02',$2,id,$3,$4,$5,$6,'HEAD_APPROVAL',$5,'2026-01-03T00:00:00Z',1 FROM leave_policies WHERE code='OTHER' RETURNING id`,[owner.employeeId,reason,owner.id,team.id,leader.id,head.id]);
    const x=await impact(admin,head);expect(x.counts.explanation_reviewer_routes).toBe(1);expect(x.counts.leave_reviewer_routes).toBe(1);
    expect((await purge(admin,head,x)).status).toBe(200);
    expect(await db.query('SELECT employee_id FROM organization_team_memberships WHERE team_id=$1',[team.id])).toEqual([{employee_id:owner.employeeId}]);
    const [grant]=await db.query<Array<{revoked_at:Date}>>('SELECT revoked_at FROM organization_management_grants WHERE user_id=$1',[head.id]);expect(grant.revoked_at).not.toBeNull();
    for(const table of ['attendance_explanation_requests','leave_requests']) {
      const [step]=await db.query<Array<{confirmed_by:string;head_user_id:string;route_version:number}>>(`SELECT confirmed_by,head_user_id,route_version FROM ${table} WHERE employee_id=$1`,[owner.employeeId]);
      expect(step).toEqual({confirmed_by:leader.id,head_user_id:head.id,route_version:1});
    }
    const explainList=await call<Array<{id:string;canAdminReview:boolean}>>(admin,'/attendance/explanations');
    expect(explainList.body.find(row=>row.id===explanation.id)?.canAdminReview).toBe(true);
    const leaveList=await call<Array<{id:string;canAdminReview:boolean}>>(admin,'/leave-requests');
    expect(leaveList.body.find(row=>row.id===leave.id)?.canAdminReview).toBe(true);
    expect(await db.query('SELECT manager_employee_id FROM employee_organization_assignments WHERE employee_id=$1',[owner.employeeId])).toEqual([{manager_employee_id:null}]);
  });
});
