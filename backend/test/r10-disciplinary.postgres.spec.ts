import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface Actor { id: string; employeeId: string; token: string }
interface Action { id: string; employeeId: string; actionType: string; status: string; title: string; reason: string; decision: string; effectiveFrom: string; effectiveTo: string | null; announcementId: string | null; revocationAnnouncementId: string | null }
interface Notice { id: string; body: string; source: string; requiresAcknowledgement: boolean; disciplinaryActionType: string; disciplinaryRevoked: boolean }
const label = 'R10 development-only acceptance';
const base = '/disciplinary-actions';

// Opt-in synthetic DB + isolated HTTP API only; no decisions issued to live users.
describe.skipIf(process.env.R10_POSTGRES_TEST !== '1')('R10 disciplinary actions — PostgreSQL / HTTP', () => {
  const name = `r10_discipline_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let db: DataSource, maintenance: DataSource, child: ChildProcess | undefined;
  let created = false, api = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R10 requires local development PostgreSQL');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() });
    await maintenance.initialize(); await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize(); await db.runMigrations();
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R10_API_ENTRY ?? 'dist/r10/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', CORS_ORIGIN: 'http://localhost:3000',
    } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R10 API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor('ADMIN'); return; }
      await delay(100);
    }
    throw new Error('R10 readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r10_discipline_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 15_000);

  async function actor(role = 'EMPLOYEE'): Promise<Actor> {
    const [user] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r10-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [user.id, role]);
    const [employee] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id', [randomUUID().slice(0, 28), label, user.id]);
    const [session] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [user.id, randomUUID(), label]);
    // Forged global ADMIN claim must never override the live DB role.
    return { id: user.id, employeeId: employee.id, token: await jwt.signAsync({ sub: user.id, sid: session.id, roles: ['ADMIN'] }, { expiresIn: 900 }) };
  }
  async function call<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, person = admin): Promise<{ status: number; body: T }> {
    const result = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${person.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const raw = await result.text();
    return { status: result.status, body: (result.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : {}) as T };
  }
  const input = (person: Actor, extra = {}): object => ({ employeeId: person.employeeId, actionType: 'WARNING', title: label, reason: label, decision: label, effectiveFrom: '2030-01-15', ...extra });
  async function draft(person: Actor, extra = {}): Promise<Action> { const r = await call<Action>(base, 'POST', input(person, extra)); expect(r.status).toBe(201); return r.body; }
  const issue = (item: Action, person = admin): Promise<{ status: number; body: Action }> => call<Action>(`${base}/${item.id}/issue`, 'POST', undefined, person);
  const revoke = (item: Action, reason = label, person = admin): Promise<{ status: number; body: Action }> => call<Action>(`${base}/${item.id}/revoke`, 'POST', { reason }, person);
  const notices = (person: Actor): Promise<{ status: number; body: Notice[] }> => call<Notice[]>('/announcements/mine', 'GET', undefined, person);
  const audit = (id: string, action: string): Promise<Array<{ id: string }>> => db.query<Array<{ id: string }>>('SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action=$2', [id, action]);

  async function collective(): Promise<{ teamId: string; departmentId: string; members: Actor[]; addMember: (person: Actor, secondary?: boolean) => Promise<void> }> {
    const [department] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const [team] = await db.query<Array<{ id: string }>>('INSERT INTO organization_teams(department_id,code,name,created_by) VALUES($1,$2,$3,$4) RETURNING id', [department.id, `R10_${randomUUID().slice(0, 8).toUpperCase()}`, label, admin.id]);
    async function addMember(person: Actor, secondary = false): Promise<void> {
      const [branch] = await db.query<Array<{ id: string }>>('INSERT INTO branches(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
      await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from) VALUES($1,$2,$3,$4,'2020-01-01')`, [person.employeeId, department.id, branch.id, !secondary]);
      await db.query('INSERT INTO organization_team_memberships(team_id,employee_id,created_by) VALUES($1,$2,$3)', [team.id, person.employeeId, admin.id]);
    }
    const members = [await actor(), await actor('MANAGER'), await actor()];
    for (const member of members) await addMember(member);
    return { teamId: team.id, departmentId: department.id, members, addMember };
  }
  type Roster = { members: Array<{ employeeId: string }>; rosterToken: string };
  async function groupPayload(fixture: Awaited<ReturnType<typeof collective>>, targetType: 'TEAM' | 'DEPARTMENT' = 'TEAM'): Promise<Record<string, unknown>> {
    const target = { targetType, targetId: targetType === 'TEAM' ? fixture.teamId : fixture.departmentId };
    const preview = await call<Roster>('/disciplinary-groups/preview', 'POST', target); expect(preview.status).toBe(201);
    return { ...target, requestId: randomUUID(), rosterToken: preview.body.rosterToken, employeeIds: preview.body.members.map(m => m.employeeId), actionType: 'WARNING', title: label, reason: label, decision: label, effectiveFrom: '2030-01-15' };
  }

  it('issues all three types, notifies only the subject, requires acknowledgement, and retains both notices on revoke', async () => {
    for (const actionType of ['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION']) {
      const owner = await actor(), other = await actor();
      const item = await draft(owner, { actionType, ...(actionType === 'SUSPENSION' ? { effectiveTo: '2030-01-16' } : {}) });
      expect((await notices(owner)).body).toHaveLength(0);
      const issued = await issue(item); expect(issued.status).toBe(201); expect(issued.body.status).toBe('ISSUED');
      const list = await call<Array<{ id: string; effectiveFrom: string }>>(base); expect(list.body.find(row => row.id === item.id)?.effectiveFrom).toBe('2030-01-15');
      const inbox = await notices(owner); expect(inbox.body).toHaveLength(1);
      expect(inbox.body[0]).toMatchObject({ id: issued.body.announcementId, source: 'DISCIPLINARY', requiresAcknowledgement: true, disciplinaryActionType: actionType, disciplinaryRevoked: false });
      expect(inbox.body[0].body).toContain(label); expect((await notices(other)).body).toHaveLength(0);
      expect((await call(`/announcements/${issued.body.announcementId}/read`, 'POST', undefined, other)).status).toBe(404);
      expect((await call(`/announcements/${issued.body.announcementId}/acknowledge`, 'POST', undefined, other)).status).toBe(404);
      expect((await call(`/announcements/${issued.body.announcementId}/read`, 'POST', undefined, owner)).status).toBe(201);
      const acknowledgements = await Promise.all([1, 2].map(() => call(`/announcements/${issued.body.announcementId}/acknowledge`, 'POST', undefined, owner)));
      expect(acknowledgements.every(r => r.status === 201)).toBe(true);
      const revoked = await revoke(item); expect(revoked.status).toBe(201);
      const after = (await notices(owner)).body; expect(after).toHaveLength(2);
      expect(after.find(n => n.id === revoked.body.revocationAnnouncementId)).toMatchObject({ disciplinaryRevoked: true, requiresAcknowledgement: true, source: 'DISCIPLINARY' });
      expect(after.find(n => n.id === issued.body.announcementId)).toMatchObject({ disciplinaryRevoked: false });
      expect(await audit(item.id, 'ISSUE')).toHaveLength(1); expect(await audit(item.id, 'REVOKE')).toHaveLength(1);
    }
  });
  it('denies all management endpoints to employees/global non-admins and ignores forged token roles', async () => {
    const owner = await actor(), item = await draft(owner);
    for (const person of [owner, await actor('CHIEF_ACCOUNTANT'), await actor('AREA_MANAGER'), await actor('MANAGER')]) {
      for (const [path, method, body] of [[base, 'GET', undefined], [base, 'POST', input(owner)], [`${base}/${item.id}`, 'PATCH', { title: label }], [`${base}/${item.id}/issue`, 'POST', undefined], [`${base}/${item.id}/revoke`, 'POST', { reason: label }], [`${base}/${item.id}/history`, 'GET', undefined]] as const) {
        expect((await call(path, method, body, person)).status).toBe(403);
      }
    }
    const unauthenticated = await fetch(`${api}${base}`); expect(unauthenticated.status).toBe(401);
  });
  it('serializes concurrent issue and revoke, producing one audit/recipient set per decision', async () => {
    const owner = await actor(), item = await draft(owner);
    const issued = await Promise.all([1, 2, 3].map(() => issue(item))); expect(issued.map(r => r.status).sort()).toEqual([201, 409, 409]);
    expect((await notices(owner)).body).toHaveLength(1);
    const revoked = await Promise.all([1, 2, 3].map(() => revoke(item))); expect(revoked.map(r => r.status).sort()).toEqual([201, 409, 409]);
    expect((await notices(owner)).body).toHaveLength(2); expect(await audit(item.id, 'ISSUE')).toHaveLength(1); expect(await audit(item.id, 'REVOKE')).toHaveLength(1);
  });
  it('edit racing issue either precedes the frozen snapshot or returns conflict; issued/revoked cannot be edited/deleted/reissued', async () => {
    const owner = await actor(), item = await draft(owner);
    const results = await Promise.all([call(`${base}/${item.id}`, 'PATCH', { title: 'R10 updated development-only title', employeeId: owner.employeeId }), issue(item)]);
    expect(results[0].status === 200 || results[0].status === 409).toBe(true); expect(results[1].status).toBe(201);
    const [saved] = await db.query<Array<{ title: string }>>('SELECT title FROM employee_disciplinary_actions WHERE id=$1', [item.id]);
    const [message] = await db.query<Array<{ title: string }>>('SELECT a.title FROM announcements a JOIN employee_disciplinary_actions da ON da.announcement_id=a.id WHERE da.id=$1', [item.id]); expect(message.title).toContain(saved.title);
    for (let stage = 0; stage < 2; stage++) {
      expect((await call(`${base}/${item.id}`, 'PATCH', { title: label })).status).toBe(409);
      expect((await issue(item)).status).toBe(409); expect((await call(`${base}/${item.id}`, 'DELETE')).status).toBe(404);
      if (stage === 0) expect((await revoke(item)).status).toBe(201);
    }
    expect((await revoke(item)).status).toBe(409);
  });
  it('retargeting a draft notifies only its final subject, never the previous employee', async () => {
    const before = await actor(), owner = await actor(), item = await draft(before);
    expect((await call(`${base}/${item.id}`, 'PATCH', { employeeId: owner.employeeId, title: label })).status).toBe(200);
    expect((await issue(item)).status).toBe(201); expect((await notices(before)).body).toHaveLength(0); expect((await notices(owner)).body).toHaveLength(1);
  });
  it('rejects blank trimmed text, invalid calendar dates, null required PATCH fields and invalid route UUIDs without 500', async () => {
    const owner = await actor();
    for (const body of [{ title: '   ' }, { reason: '     ' }, { decision: '   ' }, { effectiveFrom: '2030-02-31' }, { effectiveFrom: '0000-01-01' }, { effectiveFrom: '2030-01-15T00:00:00Z' }, { effectiveTo: '2030-99-99' }]) expect((await call(base, 'POST', input(owner, body))).status).toBe(400);
    const item = await draft(owner);
    for (const body of [{ title: '   ' }, { reason: '     ' }, { decision: '   ' }, { title: null }, { actionType: null }, { employeeId: null }, { effectiveFrom: null }, { effectiveFrom: '2030-02-31' }, { effectiveTo: '2030-02-31' }]) expect((await call(`${base}/${item.id}`, 'PATCH', body)).status).toBe(400);
    expect((await issue(item)).status).toBe(201); expect((await revoke(item, '     ')).status).toBe(400);
    for (const [suffix, method, body] of [['', 'PATCH', { title: label }], ['/issue', 'POST', undefined], ['/revoke', 'POST', { reason: label }], ['/history', 'GET', undefined]] as const) expect((await call(`${base}/not-a-uuid${suffix}`, method, body)).status).toBe(400);
    expect((await call(`${base}/${randomUUID()}/history`)).status).toBe(404);
  });
  it('enforces suspension bounds and supports clearing the optional end date on a warning draft', async () => {
    const owner = await actor();
    for (const extra of [{ actionType: 'SUSPENSION' }, { actionType: 'SUSPENSION', effectiveTo: '2030-01-14' }]) expect((await call(base, 'POST', input(owner, extra))).status).toBe(400);
    const item = await draft(owner, { actionType: 'SUSPENSION', effectiveTo: '2030-01-16' });
    expect((await call(`${base}/${item.id}`, 'PATCH', { effectiveTo: null })).status).toBe(400);
    const edited = await call<Action>(`${base}/${item.id}`, 'PATCH', { actionType: 'WARNING', effectiveTo: null }); expect(edited.status).toBe(200); expect(edited.body.effectiveTo).toBeNull();
  });
  it('issue rechecks inactive/missing accounts and revoke still preserves history when the subject is inactive', async () => {
    for (const kind of ['employee', 'account', 'missing']) {
      const owner = await actor(), item = await draft(owner);
      if (kind === 'employee') await db.query('UPDATE employees SET is_active=false,employment_end_date=current_date,employment_status_reason=$2,status_changed_at=now(),status_changed_by=$3 WHERE id=$1', [owner.employeeId, label, admin.id]);
      else if (kind === 'account') await db.query('UPDATE users SET is_active=false WHERE id=$1', [owner.id]);
      else await db.query('UPDATE employees SET user_id=NULL WHERE id=$1', [owner.employeeId]);
      expect((await issue(item)).status).toBe(409); expect(await audit(item.id, 'ISSUE')).toHaveLength(0);
    }
    const owner = await actor(), item = await draft(owner); expect((await issue(item)).status).toBe(201);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [owner.id]);
    const revoked = await revoke(item); expect(revoked.status).toBe(201); expect(revoked.body.revocationAnnouncementId).toBeNull(); expect(await audit(item.id, 'REVOKE')).toHaveLength(1);
  });
  it('issue waits for a concurrent account suspension and rechecks the committed status before notifying', async () => {
    const owner = await actor(), item = await draft(owner), runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    await runner.query('UPDATE users SET is_active=false WHERE id=$1', [owner.id]);
    let done = false; const pending = issue(item).then(r => { done = true; return r; });
    try { await delay(250); expect(done).toBe(false); await runner.commitTransaction(); expect((await pending).status).toBe(409); }
    finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); await pending; }
    expect(await audit(item.id, 'ISSUE')).toHaveLength(0);
  });
  it('audit failure rolls back decision, generated announcement and recipient together', async () => {
    const owner = await actor(), item = await draft(owner);
    await db.query(`CREATE FUNCTION r10_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='${item.id}'::uuid AND NEW.action IN ('ISSUE','REVOKE') THEN RAISE EXCEPTION 'R10_TEST_AUDIT'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r10_fail_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r10_fail_audit()');
    try { expect((await issue(item)).status).toBe(500); expect((await notices(owner)).body).toHaveLength(0); }
    finally { await db.query('DROP TRIGGER r10_fail_audit ON configuration_audit_logs'); await db.query('DROP FUNCTION r10_fail_audit()'); }
    expect((await issue(item)).status).toBe(201);
    await db.query(`CREATE FUNCTION r10_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='${item.id}'::uuid AND NEW.action='REVOKE' THEN RAISE EXCEPTION 'R10_TEST_AUDIT'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r10_fail_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r10_fail_audit()');
    try { expect((await revoke(item)).status).toBe(500); expect((await notices(owner)).body).toHaveLength(1); }
    finally { await db.query('DROP TRIGGER r10_fail_audit ON configuration_audit_logs'); await db.query('DROP FUNCTION r10_fail_audit()'); }
    const [saved] = await db.query<Array<{ status: string }>>('SELECT status FROM employee_disciplinary_actions WHERE id=$1', [item.id]); expect(saved.status).toBe('ISSUED'); expect(await audit(item.id, 'REVOKE')).toHaveLength(0);
  });
  it('preserves previous audit payloads after edits and issue/revoke; only exposes read-only history endpoints', async () => {
    const owner = await actor(), item = await draft(owner), original = await call<Array<{ action: string; newValue: unknown }>>(`${base}/${item.id}/history`);
    expect((await call(`${base}/${item.id}`, 'PATCH', { title: 'R10 edited title' })).status).toBe(200);
    expect((await issue(item)).status).toBe(201); expect((await revoke(item)).status).toBe(201);
    const history = await call<Array<{ action: string; newValue: unknown }>>(`${base}/${item.id}/history`); expect(history.body).toHaveLength(4); expect(history.body.find(h => h.action === 'CREATE')?.newValue).toEqual(original.body[0].newValue);
    for (const method of ['PATCH', 'DELETE', 'POST']) expect((await call(`${base}/${item.id}/history`, method, { title: label })).status).toBe(404);
  });
  it('does not leak disciplinary body or recipient tracking to a legacy direct manager', async () => {
    const owner = await actor(), manager = await actor('MANAGER'), item = await draft(owner);
    const [department] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const [branch] = await db.query<Array<{ id: string }>>('INSERT INTO branches(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from,manager_employee_id) VALUES($1,$2,$3,true,'2020-01-01',$4)`, [owner.employeeId, department.id, branch.id, manager.employeeId]);
    const issued = await issue(item); expect(issued.status).toBe(201);
    const list = await call<Array<{ id: string }>>('/announcements/managed', 'GET', undefined, manager); expect(list.status).toBe(200); expect(list.body.some(n => n.id === issued.body.announcementId)).toBe(false);
    expect((await call(`/announcements/${issued.body.announcementId}/recipients`, 'GET', undefined, manager)).status).toBe(403);
  });
  it('push disabled is tracked without rolling back inbox and never claims SENT', async () => {
    const owner = await actor(), item = await draft(owner), issued = await issue(item); expect(issued.status).toBe(201);
    const [recipient] = await db.query<Array<{ status: string; failure: string; attempts: number }>>('SELECT push_status status,push_failure_code failure,push_attempt_count attempts FROM announcement_recipients WHERE announcement_id=$1', [issued.body.announcementId]);
    expect(recipient).toMatchObject({ status: 'SKIPPED', failure: 'PUSH_NOT_CONFIGURED', attempts: 1 });
    expect((await call(`/announcements/${issued.body.announcementId}/push/retry`, 'POST')).status).toBe(201); expect((await notices(owner)).body).toHaveLength(1);
  });
  it('suspension does not alter employment/session/attendance/payroll as a side effect', async () => {
    const owner = await actor(), item = await draft(owner, { actionType: 'SUSPENSION', effectiveTo: '2030-01-16' }); expect((await issue(item)).status).toBe(201);
    const [saved] = await db.query<Array<{ employeeActive: boolean; userActive: boolean; sessionRevoked: null }>>('SELECT e.is_active "employeeActive",u.is_active "userActive",s.revoked_at "sessionRevoked" FROM employees e JOIN users u ON u.id=e.user_id JOIN auth_sessions s ON s.user_id=u.id WHERE e.id=$1', [owner.employeeId]);
    expect(saved).toEqual({ employeeActive: true, userActive: true, sessionRevoked: null }); expect((await call('/auth/me', 'GET', undefined, owner)).status).toBe(200);
    const [events] = await db.query<Array<{ count: number }>>('SELECT count(*)::int count FROM attendance_events WHERE employee_id=$1', [owner.employeeId]); expect(events.count).toBe(0);
  });

  it('keeps disciplinary issue/revocation notices immutable in Announcements, while allowing revocation through the decision', async () => {
    const owner = await actor(), item = await draft(owner), issued = await issue(item);
    expect((await call(`/announcements/${issued.body.announcementId}/status`, 'PATCH', { status: 'WITHDRAWN' })).status).toBe(409);
    expect((await call(`/announcements/${issued.body.announcementId}`, 'PATCH', { title: 'Cannot edit issued decision notice' })).status).toBe(409);
    const revoked = await revoke(item); expect(revoked.status).toBe(201);
    expect((await call(`/announcements/${revoked.body.revocationAnnouncementId}/status`, 'PATCH', { status: 'WITHDRAWN' })).status).toBe(409);
    expect((await notices(owner)).body).toHaveLength(2);
  });

  it('previews cross-branch team members, allows exceptions, freezes recipients and bulk-revokes the original list after membership changes', async () => {
    const fixture = await collective(), payload = await groupPayload(fixture), [first, excluded, third] = fixture.members;
    expect((payload.employeeIds as string[]).sort()).toEqual(fixture.members.map(m => m.employeeId).sort());
    payload.employeeIds = [first.employeeId, third.employeeId];
    const issued = await call<{ id: string; recipientCount: number }>('/disciplinary-groups', 'POST', payload); expect(issued.status).toBe(201); expect(issued.body.recipientCount).toBe(2);
    expect((await notices(first)).body).toHaveLength(1); expect((await notices(third)).body).toHaveLength(1); expect((await notices(excluded)).body).toHaveLength(0);
    const childActions = await db.query<Action[]>('SELECT id,employee_id AS "employeeId" FROM employee_disciplinary_actions WHERE group_id=$1', [issued.body.id]);
    expect((await revoke(childActions[0])).status).toBe(409); expect((await issue(childActions[0])).status).toBe(409);
    expect((await call(`${base}/${childActions[0].id}`, 'PATCH', { title: label })).status).toBe(409);
    await db.query('UPDATE organization_team_memberships SET ended_at=now(),ended_by=$2,end_reason=$3 WHERE team_id=$1 AND employee_id=$4', [fixture.teamId, admin.id, label, first.employeeId]);
    const late = await actor(); await fixture.addMember(late);
    const results = await Promise.all([1, 2].map(() => call(`/disciplinary-groups/${issued.body.id}/revoke`, 'POST', { reason: label }))); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await notices(first)).body).toHaveLength(2); expect((await notices(third)).body).toHaveLength(2); expect((await notices(late)).body).toHaveLength(0); expect((await notices(excluded)).body).toHaveLength(0);
    expect(await audit(issued.body.id, 'ISSUE')).toHaveLength(1); expect(await audit(issued.body.id, 'REVOKE')).toHaveLength(1);
    const list = await call<Array<{ id: string; selectedMembers: unknown[]; receipts: unknown[]; status: string }>>('/disciplinary-groups');
    expect(list.status).toBe(200); expect(list.body.find(g => g.id === issued.body.id)?.status).toBe('REVOKED'); expect(Array.isArray(list.body.find(g => g.id === issued.body.id)?.receipts)).toBe(true);
    expect(list.body.find(g => g.id === issued.body.id)?.selectedMembers).toHaveLength(2);
  });

  it('rejects stale roster, inactive target, outsiders, empty/duplicate selection and repeated collective submit without partial notifications', async () => {
    const fixture = await collective(), stale = await groupPayload(fixture), late = await actor(); await fixture.addMember(late);
    expect((await call('/disciplinary-groups', 'POST', stale)).status).toBe(409);
    const payload = await groupPayload(fixture), outsider = await actor();
    for (const ids of [[], [outsider.employeeId], [fixture.members[0].employeeId, fixture.members[0].employeeId]]) expect((await call('/disciplinary-groups', 'POST', { ...payload, employeeIds: ids })).status).toBe(400);
    expect((await notices(fixture.members[0])).body).toHaveLength(0);
    const results = await Promise.all([1, 2].map(() => call('/disciplinary-groups', 'POST', payload))); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await notices(late)).body).toHaveLength(1);
    await db.query('UPDATE organization_teams SET is_active=false WHERE id=$1', [fixture.teamId]);
    expect((await call('/disciplinary-groups/preview', 'POST', { targetType: 'TEAM', targetId: fixture.teamId })).status).toBe(400);
  });

  it('department preview includes secondary assignments once, excludes expired assignments/inactive accounts, and denies non-admin group APIs', async () => {
    const fixture = await collective(), extra = await actor(); await fixture.addMember(extra, true);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [fixture.members[0].id]);
    await db.query(`UPDATE employee_organization_assignments SET effective_to='2020-01-02' WHERE employee_id=$1`, [fixture.members[1].employeeId]);
    const payload = await groupPayload(fixture, 'DEPARTMENT'); expect((payload.employeeIds as string[]).sort()).toEqual([fixture.members[2].employeeId, extra.employeeId].sort());
    for (const [path, method, body] of [['/disciplinary-groups', 'GET', undefined], ['/disciplinary-groups/targets', 'GET', undefined], ['/disciplinary-groups/preview', 'POST', { targetType: 'TEAM', targetId: fixture.teamId }], ['/disciplinary-groups', 'POST', payload], [`/disciplinary-groups/${randomUUID()}/revoke`, 'POST', { reason: label }], [`/disciplinary-groups/${randomUUID()}/history`, 'GET', undefined]] as const) expect((await call(path, method, body, extra)).status).toBe(403);
    expect((await call('/disciplinary-groups', 'POST', payload)).status).toBe(201);
  });

  it('group audit failures roll back every child, notice and master on issue/revoke; history is append-only through HTTP', async () => {
    const fixture = await collective(), payload = await groupPayload(fixture);
    await db.query(`CREATE FUNCTION r10_fail_group_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_type='DISCIPLINARY_GROUP' THEN RAISE EXCEPTION 'R10_TEST_GROUP_AUDIT'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r10_fail_group_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r10_fail_group_audit()');
    try { expect((await call('/disciplinary-groups', 'POST', payload)).status).toBe(500); for (const person of fixture.members) expect((await notices(person)).body).toHaveLength(0); }
    finally { await db.query('DROP TRIGGER r10_fail_group_audit ON configuration_audit_logs'); }
    const issued = await call<{ id: string }>('/disciplinary-groups', 'POST', payload); expect(issued.status).toBe(201);
    await db.query('CREATE TRIGGER r10_fail_group_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r10_fail_group_audit()');
    try { expect((await call(`/disciplinary-groups/${issued.body.id}/revoke`, 'POST', { reason: label })).status).toBe(500); for (const person of fixture.members) expect((await notices(person)).body).toHaveLength(1); }
    finally { await db.query('DROP TRIGGER r10_fail_group_audit ON configuration_audit_logs'); await db.query('DROP FUNCTION r10_fail_group_audit()'); }
    expect((await call(`/disciplinary-groups/${issued.body.id}/revoke`, 'POST', { reason: label })).status).toBe(201);
    const history = await call<unknown[]>(`/disciplinary-groups/${issued.body.id}/history`); expect(history.body).toHaveLength(2);
    for (const method of ['PATCH', 'DELETE', 'POST']) expect((await call(`/disciplinary-groups/${issued.body.id}/history`, method, {})).status).toBe(404);
    expect((await call(`/disciplinary-groups/${issued.body.id}`, 'DELETE')).status).toBe(404);
  });

  it('collective personal receipts are independent; scoped Head cannot read private disciplinary tracking', async () => {
    const fixture = await collective(), payload = await groupPayload(fixture), issued = await call<{ id: string }>('/disciplinary-groups', 'POST', payload); expect(issued.status).toBe(201);
    const owner = fixture.members[0], head = await actor();
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL',now()-interval '1 day',$3,$4)`, [head.id, fixture.departmentId, label, admin.id]);
    const inbox = (await notices(owner)).body;
    expect((await call(`/announcements/${inbox[0].id}/acknowledge`, 'POST', undefined, owner)).status).toBe(201);
    const list = await call<Array<{ id: string; receipts: Array<{ employeeId: string; acknowledgedAt: string | null }> }>>('/disciplinary-groups');
    const receipts = list.body.find(group => group.id === issued.body.id)?.receipts;
    expect(receipts?.find(receipt => receipt.employeeId === owner.employeeId)?.acknowledgedAt).toBeTruthy();
    expect(receipts?.find(receipt => receipt.employeeId === fixture.members[1].employeeId)?.acknowledgedAt).toBeNull();
    const managed = await call<unknown[]>('/organization/managed/announcements', 'GET', undefined, head); expect(managed.status).toBe(200); expect(managed.body).toHaveLength(0);
  });

  it('hard deletion of one employee preserves the group snapshot and other recipients; bulk revoke never resurrects the deleted profile', async () => {
    const fixture = await collective(), payload = await groupPayload(fixture), issued = await call<{ id: string }>('/disciplinary-groups', 'POST', payload); expect(issued.status).toBe(201);
    const owner = fixture.members[0];
    const impact = await call<{ employeeCode: string; confirmationToken: string }>(`/employees/${owner.employeeId}/deletion-impact`); expect(impact.status).toBe(200);
    expect((await call(`/employees/${owner.employeeId}`, 'DELETE', { employeeCode: impact.body.employeeCode, confirmationToken: impact.body.confirmationToken, reason: label })).status).toBe(200);
    const revoked = await call(`/disciplinary-groups/${issued.body.id}/revoke`, 'POST', { reason: label }); expect(revoked.status).toBe(201);
    expect((await notices(fixture.members[1])).body).toHaveLength(2);
    expect(await db.query('SELECT id FROM employees WHERE id=$1', [owner.employeeId])).toHaveLength(0);
    const [group] = await db.query<Array<{ selectedMembers: unknown[] }>>('SELECT selected_members AS "selectedMembers" FROM disciplinary_action_groups WHERE id=$1', [issued.body.id]); expect(group.selectedMembers).toHaveLength(3);
    expect(await audit(issued.body.id, 'ISSUE')).toHaveLength(1); expect(await audit(issued.body.id, 'REVOKE')).toHaveLength(1);
  });
});
