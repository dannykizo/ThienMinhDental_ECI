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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

interface Actor { id: string; employeeId: string; token: string }
interface Team { id: string; departmentId: string; code: string; name: string }
interface Person { id?: string; employeeId?: string; employeeCode: string; fullName: string; branches: string[]; status?: string }
interface RequestRow { id: string; routeVersion: number; confirmedBy: string | null; confirmedAt: string | null; workflowTeamId: string; leaderUserId: string; headUserId: string; approvalStage: string; status: string }
interface Layout { admin: Actor; leader: Actor; head: Actor; other: Actor; hcm: Actor; hn: Actor; outside: Actor; department: string; foreignDepartment: string; branch: string; team: Team; sibling: Team; foreignTeam: Team }
const developmentReason = 'R2 Development-only acceptance';

// Explicitly requested R2 acceptance only: owned local DB and isolated HTTP API.
// Tokens/accounts/files never touch the customer's database, SMTP or Firebase.
describe.skipIf(process.env.R2_POSTGRES_TEST !== '1')('R2 organization — PostgreSQL and real HTTP', () => {
  const name = `r2_org_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2);
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 900 } });
  let maintenance: DataSource;
  let db: DataSource;
  let created = false;
  let apiProcess: ChildProcess | undefined;
  let api = '';
  let evidenceRoot = '';

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R2 requires a local development database');
    if (!/^r2_org_test_[a-f0-9]{32}$/.test(name) || url.pathname === `/${name}`) throw new Error('Unsafe R2 DB target');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() });
    await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize(); await db.runMigrations();
    evidenceRoot = await mkdtemp(join(tmpdir(), 'r2-evidence-'));
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
    api = `http://127.0.0.1:${port}/api`;
    apiProcess = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false',
      NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000',
      EVIDENCE_STORAGE_DIR: join(evidenceRoot, 'attendance'), BUSINESS_TRIP_EVIDENCE_STORAGE_DIR: join(evidenceRoot, 'trips'),
    } });
    for (let attempt = 0; attempt < 200; attempt++) {
      if (apiProcess.exitCode !== null) throw new Error('Isolated R2 API exited; build Backend first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) return;
      await delay(100);
    }
    throw new Error('Isolated R2 API readiness timed out');
  }, 30_000);

  afterAll(async () => {
    if (apiProcess && apiProcess.exitCode === null) { const exited = once(apiProcess, 'exit'); apiProcess.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r2_org_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    // Delete only the exact temporary directory created above, never project storage.
    if (evidenceRoot && dirname(resolve(evidenceRoot)) === resolve(tmpdir()) && basename(evidenceRoot).startsWith('r2-evidence-')) await rm(evidenceRoot, { recursive: true, force: true });
  }, 15_000);

  async function call<T = Record<string, unknown>>(actor: Actor, path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: T }> {
    const response = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${actor.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as T };
  }
  async function actor(role: RoleCode = RoleCode.Employee): Promise<Actor> {
    const [user] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r2-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [user.id, role]);
    const [employee] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,phone) VALUES($1,$2,$3,'PRIVATE-NOT-RETURNED') RETURNING id`, [randomUUID().slice(0, 28), developmentReason, user.id]);
    const [session] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,'R2 Development only','MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [user.id, randomUUID()]);
    return { id: user.id, employeeId: employee.id, token: await jwt.signAsync({ sub: user.id, sid: session.id, roles: [RoleCode.Admin] }) };
  }
  async function catalog(table: 'branches' | 'departments'): Promise<string> {
    const [row] = await db.query<Array<{ id: string }>>(`INSERT INTO ${table}(code,name) VALUES($1,$2) RETURNING id`, [randomUUID().slice(0, 28), `${developmentReason} ${randomUUID()}`]); return row.id;
  }
  async function assignment(person: Actor, department: string, branch: string): Promise<void> {
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from) VALUES($1,$2,$3,false,'2020-01-01')`, [person.employeeId, department, branch]);
  }
  async function team(admin: Actor, departmentId: string): Promise<Team> {
    const result = await call<Team>(admin, '/organization/teams', 'POST', { departmentId, code: randomUUID().slice(0, 28), name: developmentReason }); expect(result.status).toBe(201); return result.body;
  }
  async function grant(admin: Actor, person: Actor, scope: { departmentId: string } | { teamId: string }, extra: Record<string, unknown> = {}): Promise<string> {
    const result = await call<{ id: string }>(admin, '/organization/grants', 'POST', { employeeId: person.employeeId, roleCode: 'teamId' in scope ? 'TEAM_LEADER' : 'DEPARTMENT_HEAD', ...scope, appointmentType: 'OFFICIAL', validFrom: '2020-01-01T00:00:00Z', reason: developmentReason, ...extra }); expect(result.status).toBe(201); return result.body.id;
  }
  async function member(admin: Actor, target: Team, person: Actor): Promise<string> {
    const result = await call<{ id: string }>(admin, `/organization/teams/${target.id}/members`, 'POST', { employeeId: person.employeeId }); expect(result.status).toBe(201); return result.body.id;
  }
  async function layout(): Promise<Layout> {
    const admin = await actor(RoleCode.Admin), leader = await actor(), head = await actor(), other = await actor(), hcm = await actor(), hn = await actor(), outside = await actor();
    const department = await catalog('departments'), foreignDepartment = await catalog('departments'), branch = await catalog('branches'), north = await catalog('branches');
    const first = await team(admin, department), sibling = await team(admin, department), foreignTeam = await team(admin, foreignDepartment);
    await assignment(hcm, department, branch); await assignment(hn, department, north); await assignment(outside, foreignDepartment, branch);
    await member(admin, first, hcm); await member(admin, first, hn); await member(admin, foreignTeam, outside);
    await grant(admin, leader, { teamId: first.id }); await grant(admin, head, { departmentId: department }); await grant(admin, other, { teamId: foreignTeam.id });
    return { admin, leader, head, other, hcm, hn, outside, department, foreignDepartment, branch, team: first, sibling, foreignTeam };
  }

  it('keeps one immutable department, unique team codes and cross-branch membership', async () => {
    const x = await layout();
    const rows = await call<Person[]>(x.leader, `/organization/teams/${x.team.id}/members`);
    expect(rows.status).toBe(200); expect(rows.body.map(p => p.employeeId).sort()).toEqual([x.hcm.employeeId, x.hn.employeeId].sort());
    expect(rows.body.every(p => !('phone' in p) && !('email' in p) && !('userId' in p))).toBe(true);
    expect((await call(x.admin, `/organization/teams/${x.team.id}/members`, 'POST', { employeeId: x.outside.employeeId })).status).toBe(400);
    expect((await call(x.admin, '/organization/teams', 'POST', { departmentId: x.department, code: x.team.code, name: developmentReason })).status).toBe(409);
    expect((await call(x.admin, `/organization/teams/${x.team.id}`, 'PATCH', { name: developmentReason, isActive: true, departmentId: x.foreignDepartment })).status).toBe(400);
  });

  it('membership and forged JWT role claims do not grant Admin or management access', async () => {
    const x = await layout();
    expect((await call<{ capabilities: { readScopedDirectory: boolean } }>(x.hcm, '/organization/mine')).body.capabilities.readScopedDirectory).toBe(false);
    expect((await call<Team[]>(x.hcm, '/organization/teams')).body).toEqual([]);
    for (const path of ['/organization/grants', '/organization/history', '/organization/catalog/departments', `/employees/${x.hn.employeeId}`]) expect((await call(x.leader, path)).status).toBe(403);
    expect((await call(x.hcm, '/organization/teams', 'POST', { departmentId: x.department, code: 'DENIED', name: developmentReason })).status).toBe(403);
    expect((await call(x.leader, '/organization/grants', 'POST', {})).status).toBe(403);
  });

  it('Head sees its department; Leader cannot see siblings, another department or contacts', async () => {
    const x = await layout();
    expect((await call<Team[]>(x.head, '/organization/teams')).body.map(t => t.id).sort()).toEqual([x.team.id, x.sibling.id].sort());
    expect((await call<Team[]>(x.leader, '/organization/teams')).body.map(t => t.id)).toEqual([x.team.id]);
    expect((await call(x.leader, `/organization/teams/${x.sibling.id}/members`)).status).toBe(403);
    expect((await call(x.head, `/organization/departments/${x.foreignDepartment}/employees`)).status).toBe(403);
    expect((await call(x.leader, `/organization/departments/${x.department}/employees`)).status).toBe(403);
    const people = await call<Person[]>(x.head, `/organization/departments/${x.department}/employees`);
    expect(people.body.map(p => p.id).sort()).toEqual([x.hcm.employeeId, x.hn.employeeId].sort());
    expect(people.body.every(p => Object.keys(p).sort().join(',') === 'branches,employeeCode,fullName,id')).toBe(true);
  });

  it('supports secondary department assignments but never leaks their unrelated branch', async () => {
    const x = await layout(), foreignBranch = await catalog('branches');
    await assignment(x.hcm, x.foreignDepartment, foreignBranch);
    await member(x.admin, x.foreignTeam, x.hcm);
    const own = await call<Person[]>(x.leader, `/organization/teams/${x.team.id}/members`);
    const [branchName] = await db.query<Array<{ name: string }>>('SELECT name FROM branches WHERE id=$1', [x.branch]);
    expect(own.body.find(p => p.employeeId === x.hcm.employeeId)?.branches).toEqual([branchName.name]);
    await grant(x.admin, x.leader, { teamId: x.foreignTeam.id }, { appointmentType: 'TEMPORARY' });
    expect((await call<Team[]>(x.leader, '/organization/teams')).body.map(t => t.id).sort()).toEqual([x.team.id, x.foreignTeam.id].sort());
  });

  it.each(['team','department'] as const)('removes inactive accounts from %s directory while preserving Admin membership history', async scope => {
    const x = await layout(); await db.query('UPDATE users SET is_active=false WHERE id=$1', [x.hcm.id]);
    const manager = scope==='team' ? x.leader : x.head;
    const path = scope==='team' ? `/organization/teams/${x.team.id}/members` : `/organization/departments/${x.department}/employees`;
    expect((await call<Person[]>(manager, path)).body.map(p => p.employeeId ?? p.id)).not.toContain(x.hcm.employeeId);
    expect((await call<Person[]>(x.admin, `/organization/teams/${x.team.id}/members`)).body.find(p => p.employeeId === x.hcm.employeeId)?.status).toBe('INACTIVE');
    await db.query('UPDATE users SET is_active=true WHERE id=$1', [x.hcm.id]);
    expect((await call<Person[]>(manager, path)).body.map(p => p.employeeId ?? p.id)).toContain(x.hcm.employeeId);
  });

  it('rechecks assignment/branch activity and does not expose ended memberships to managers', async () => {
    const x = await layout();
    await db.query('UPDATE branches SET is_active=false WHERE id=$1', [x.branch]);
    expect((await call<Person[]>(x.leader, `/organization/teams/${x.team.id}/members`)).body.map(p=>p.employeeId)).not.toContain(x.hcm.employeeId);
    await db.query('UPDATE branches SET is_active=true WHERE id=$1', [x.branch]);
    await db.query(`UPDATE employee_organization_assignments SET effective_to='2020-01-02' WHERE employee_id=$1`, [x.hcm.employeeId]);
    expect((await call<Person[]>(x.head, `/organization/departments/${x.department}/employees`)).body.map(p=>p.id)).not.toContain(x.hcm.employeeId);
    const history = await call<Array<Person & {id:string}>>(x.admin, `/organization/teams/${x.team.id}/members`);
    const membership = history.body.find(p=>p.employeeId===x.hn.employeeId)!;
    await call(x.admin, `/organization/teams/${x.team.id}/members/${membership.id}/end`, 'POST', {reason:developmentReason});
    expect((await call<Person[]>(x.leader, `/organization/teams/${x.team.id}/members`)).body).toEqual([]);
    expect((await call<Person[]>(x.admin, `/organization/teams/${x.team.id}/members`)).body).toHaveLength(2);
  });

  it('supports multiple Head scopes while active account/profile and department eligibility are checked live', async () => {
    const x=await layout(); await grant(x.admin,x.head,{departmentId:x.foreignDepartment});
    expect((await call<Team[]>(x.head,'/organization/teams')).body.map(t=>t.id).sort()).toEqual([x.team.id,x.sibling.id,x.foreignTeam.id].sort());
    await db.query('UPDATE employees SET is_active=false,employment_end_date=CURRENT_DATE,employment_status_reason=$2 WHERE id=$1',[x.head.employeeId,developmentReason]);
    const inactive=await call<Array<{userId:string;status:string}>>(x.admin,'/organization/grants');
    expect(inactive.body.filter(g=>g.userId===x.head.id).every(g=>g.status==='INACTIVE')).toBe(true);
    await db.query('UPDATE employees SET is_active=true,employment_end_date=NULL,employment_status_reason=NULL WHERE id=$1',[x.head.employeeId]);
    await db.query('UPDATE departments SET is_active=false WHERE id=$1',[x.department]);
    expect((await call<Team[]>(x.head,'/organization/teams')).body.map(t=>t.id)).toEqual([x.foreignTeam.id]);
  });

  it('ends/re-adds membership without granting/revoking independent manager grants', async () => {
    const x = await layout(); await assignment(x.leader, x.department, x.branch);
    const id = await member(x.admin, x.team, x.leader);
    expect((await call(x.admin, `/organization/teams/${x.team.id}/members/${id}/end`, 'POST', { reason: developmentReason })).status).toBe(201);
    expect((await call(x.admin, `/organization/teams/${x.team.id}/members/${id}/end`, 'POST', { reason: developmentReason })).status).toBe(409);
    expect((await call<Team[]>(x.leader, '/organization/teams')).body.map(t => t.id)).toContain(x.team.id);
    const again = await member(x.admin, x.team, x.leader); expect(again).not.toBe(id);
    const history = await call<Person[]>(x.admin, `/organization/teams/${x.team.id}/members`);
    expect(history.body.filter(p => p.employeeId === x.leader.employeeId).map(p => p.status).sort()).toEqual(['ACTIVE', 'ENDED']);
  });

  it('enforces grant scheduling, expiry, revocation and adjacent non-overlapping intervals', async () => {
    const x = await layout(), person = await actor();
    const scheduled = await grant(x.admin, person, { teamId: x.sibling.id }, { validFrom: '2199-01-01T00:00:00Z', validUntil: '2199-02-01T00:00:00Z', appointmentType: 'TEMPORARY' });
    expect((await call<Team[]>(person, '/organization/teams')).body).toEqual([]);
    await grant(x.admin, person, { teamId: x.sibling.id }, { validFrom: '2199-02-01T00:00:00Z' });
    await db.query(`UPDATE organization_management_grants SET valid_from=now()-interval '1 day',valid_until=now()+interval '1 day' WHERE id=$1`, [scheduled]);
    expect((await call<Team[]>(person, '/organization/teams')).body.map(t => t.id)).toContain(x.sibling.id);
    await db.query('UPDATE organization_management_grants SET valid_until=now() WHERE id=$1', [scheduled]);
    expect((await call<Team[]>(person, '/organization/teams')).body).toEqual([]);
    const active = await grant(x.admin, person, { teamId: x.team.id });
    expect((await call(x.admin, `/organization/grants/${active}/revoke`, 'POST', { reason: '   ' })).status).toBe(400);
    expect((await call(x.admin, `/organization/grants/${active}/revoke`, 'POST', { reason: developmentReason })).status).toBe(201);
    expect((await call<Team[]>(person, '/organization/teams')).body).toEqual([]);
    expect((await call(x.admin, `/organization/grants/${active}/revoke`, 'POST', { reason: developmentReason })).status).toBe(409);
  });

  it('concurrent grants and membership additions create one record and one matching audit', async () => {
    const x = await layout(), person = await actor(); await assignment(person, x.department, x.branch);
    const input = { employeeId: person.employeeId, roleCode: 'TEAM_LEADER', teamId: x.sibling.id, appointmentType: 'OFFICIAL', validFrom: '2020-01-01T00:00:00Z', reason: developmentReason };
    const grants = await Promise.all([call(x.admin, '/organization/grants', 'POST', input), call(x.admin, '/organization/grants', 'POST', input)]);
    expect(grants.map(r => r.status).sort()).toEqual([201, 409]);
    const memberships = await Promise.all([call(x.admin, `/organization/teams/${x.sibling.id}/members`, 'POST', { employeeId: person.employeeId }), call(x.admin, `/organization/teams/${x.sibling.id}/members`, 'POST', { employeeId: person.employeeId })]);
    expect(memberships.map(r => r.status).sort()).toEqual([201, 409]);
    const [counts] = await db.query<Array<{ grants: number; memberships: number; audits: number }>>(`SELECT (SELECT count(*)::int FROM organization_management_grants WHERE user_id=$1) AS grants,(SELECT count(*)::int FROM organization_team_memberships WHERE employee_id=$2) AS memberships,(SELECT count(*)::int FROM configuration_audit_logs WHERE new_value->>'employeeId'=$2::text AND action IN ('GRANT','ADD')) AS audits`, [person.id, person.employeeId]);
    expect(counts).toEqual({ grants: 1, memberships: 1, audits: 2 });
  });

  it('serializes permanent deletion against a racing first use without orphaning or erasing history', async () => {
    const admin=await actor(RoleCode.Admin);
    const position=await call<{id:string}>(admin,'/organization/catalog/positions','POST',{code:randomUUID().slice(0,28),name:developmentReason});
    expect(position.status).toBe(201);
    const preview=await call<{confirmationToken:string}>(admin,`/organization/catalog/positions/${position.body.id}/impact`);
    const outcomes=await Promise.all([
      call(admin,`/organization/catalog/positions/${position.body.id}`,'DELETE',{reason:developmentReason,confirmationToken:preview.body.confirmationToken}),
      db.query(`INSERT INTO employees(employee_code,full_name,position_id) VALUES($1,$2,$3)`,[randomUUID().slice(0,28),developmentReason,position.body.id])
        .then(()=> 'INSERTED').catch((error:unknown)=> { if ((error as {code?:string}).code!=='23503') throw error; return 'FK_REJECTED'; }),
    ]);
    expect([[200,'FK_REJECTED'],[409,'INSERTED']]).toContainEqual([outcomes[0].status,outcomes[1]]);
    if (outcomes[1]==='INSERTED') {
      expect(await db.query('SELECT id FROM positions WHERE id=$1',[position.body.id])).toHaveLength(1);
      expect(await db.query('SELECT catalog_id FROM organization_catalog_usage WHERE catalog_id=$1',[position.body.id])).toHaveLength(1);
    }
  });

  it('archiving/restoring scope does not revive revoked grants or alter employee assignments', async () => {
    const x = await layout();
    async function toggle(kind: 'teams' | 'departments', id: string, isActive: boolean): Promise<void> {
      const impact = await call<{ confirmationToken: string; item: { code: string; name: string } }>(x.admin, `/organization/catalog/${kind}/${id}/impact`);
      expect((await call(x.admin, `/organization/catalog/${kind}/${id}`, 'PATCH', { code: impact.body.item.code, name: impact.body.item.name, isActive, reason: developmentReason, confirmationToken: impact.body.confirmationToken })).status).toBe(200);
    }
    // Send only supported DTO fields rather than the impact item's UUID.
    await toggle('teams', x.team.id, false);
    expect((await call<Team[]>(x.leader, '/organization/teams')).body).toEqual([]);
    await toggle('teams', x.team.id, true);
    expect((await call<Team[]>(x.leader, '/organization/teams')).body.map(t => t.id)).toContain(x.team.id);
    const grants = await call<Array<{ id: string; userId: string }>>(x.admin, '/organization/grants');
    const id = grants.body.find(g => g.userId === x.leader.id)!.id;
    await call(x.admin, `/organization/grants/${id}/revoke`, 'POST', { reason: developmentReason });
    await toggle('departments', x.department, false); await toggle('departments', x.department, true);
    expect((await call<Team[]>(x.leader, '/organization/teams')).body).toEqual([]);
    const [count] = await db.query<Array<{ count: number }>>('SELECT count(*)::int AS count FROM employee_organization_assignments WHERE employee_id=$1', [x.hcm.employeeId]); expect(count.count).toBe(1);
  });

  async function routed(x: Layout, kind: 'explanation' | 'leave'): Promise<RequestRow> {
    const route = { teamId: x.team.id, leaderUserId: x.leader.id, headUserId: x.head.id, expectedVersion: 0, reason: developmentReason };
    const base = kind === 'explanation' ? '/attendance/explanations' : '/leave-requests';
    expect((await call(x.admin, `${base}/routes/${x.hcm.employeeId}`, 'PUT', route)).status).toBe(200);
    if (kind === 'explanation') {
      const result = await call<RequestRow>(x.hcm, `${base}/mine`, 'POST', { workDate: '2026-10-09', issueType: 'OTHER', responseText: developmentReason, submissionId: randomUUID() }); expect(result.status).toBe(201); return result.body;
    }
    const [row] = await db.query<Array<{ id: string }>>(`INSERT INTO leave_requests(employee_id,leave_type,policy_id,start_date,end_date,reason,submitted_by,workflow_team_id,leader_user_id,head_user_id,route_version,approval_stage) SELECT $1,code,id,'2026-10-09','2026-10-09',$2,$3,$4,$5,$6,1,'LEADER_CONFIRMATION' FROM leave_policies LIMIT 1 RETURNING id`, [x.hcm.employeeId, developmentReason, x.hcm.id, x.team.id, x.leader.id, x.head.id]);
    return (await call<RequestRow[]>(x.admin, base)).body.find(r => r.id === row.id)!;
  }

  it.each(['explanation', 'leave'] as const)('%s rerouting preserves completed confirmation and rejects stale/out-of-scope changes', async kind => {
    const x = await layout(), request = await routed(x, kind), replacement = await actor();
    await grant(x.admin, replacement, { departmentId: x.department });
    const base = kind === 'explanation' ? '/attendance/explanations' : '/leave-requests';
    const confirmed = await call<RequestRow>(x.leader, `${base}/${request.id}/confirm`, 'PATCH', { expectedVersion: request.routeVersion, confirmationNote: developmentReason }); expect(confirmed.status).toBe(200);
    const route = { teamId: x.team.id, leaderUserId: x.leader.id, headUserId: replacement.id, expectedVersion: confirmed.body.routeVersion, reason: developmentReason };
    expect((await call(x.admin, `${base}/${request.id}/reroute`, 'PATCH', { ...route, expectedVersion: request.routeVersion })).status).toBe(409);
    expect((await call(x.admin, `${base}/${request.id}/reroute`, 'PATCH', { ...route, teamId: x.sibling.id })).status).toBe(409);
    expect((await call(x.admin, `${base}/${request.id}/reroute`, 'PATCH', { ...route, headUserId: x.other.id })).status).toBe(400);
    const changed = await call<RequestRow>(x.admin, `${base}/${request.id}/reroute`, 'PATCH', route); expect(changed.status).toBe(200);
    expect(changed.body.confirmedBy).toBe(confirmed.body.confirmedBy); expect(changed.body.confirmedAt).toBe(confirmed.body.confirmedAt); expect(changed.body.workflowTeamId).toBe(x.team.id); expect(changed.body.leaderUserId).toBe(x.leader.id); expect(changed.body.headUserId).toBe(replacement.id);
    expect((await call(x.head, `${base}/${request.id}/history`)).status).toBe(404);
    expect((await call(replacement, `${base}/${request.id}/history`)).status).toBe(200);
    expect((await call(x.other, `${base}/${request.id}/history`)).status).toBe(404);
  });

  it('limits actual image bytes to owner/Admin/assigned live managers and withdraws access after grant revocation', async () => {
    const x = await layout(), request = await routed(x, 'explanation');
    const filenameId = randomUUID();
    const form = new FormData(); form.set('evidenceId', filenameId);
    form.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'development-only.png');
    const uploaded = await fetch(`${api}/attendance/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${x.hcm.token}` }, body: form }); expect(uploaded.status).toBe(201);
    const { reference } = await uploaded.json() as { reference: string };
    await db.query('UPDATE attendance_explanation_requests SET evidence_image_reference=$2 WHERE id=$1', [request.id, reference]);
    for (const person of [x.hcm, x.admin, x.leader, x.head]) expect((await fetch(`${api}${reference.replace(/^\/api/, '')}`, { headers: { Authorization: `Bearer ${person.token}` } })).status).toBe(200);
    expect((await fetch(`${api}${reference.replace(/^\/api/, '')}`, { headers: { Authorization: `Bearer ${x.other.token}` } })).status).toBe(404);
    const grants = await call<Array<{ id: string; userId: string }>>(x.admin, '/organization/grants');
    await call(x.admin, `/organization/grants/${grants.body.find(g => g.userId === x.leader.id)!.id}/revoke`, 'POST', { reason: developmentReason });
    expect((await fetch(`${api}${reference.replace(/^\/api/, '')}`, { headers: { Authorization: `Bearer ${x.leader.token}` } })).status).toBe(404);
  });
});
