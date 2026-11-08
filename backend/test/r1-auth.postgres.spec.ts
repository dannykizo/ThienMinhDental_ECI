import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { AuthService, type LoginResult } from '../src/modules/auth/application/auth.service.js';
import type { LoginContext, LoginAlertResult, AuthSessionRecord } from '../src/modules/auth/application/auth.ports.js';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/bcrypt-password-hasher.js';
import { JwtAccessTokenService } from '../src/modules/auth/infrastructure/jwt-access-token.service.js';
import { TypeOrmAuthSessionRepository } from '../src/modules/auth/infrastructure/typeorm-auth-session.repository.js';
import { TypeOrmUserAuthenticationRepository } from '../src/modules/auth/infrastructure/typeorm-user-authentication.repository.js';
import { JwtAuthGuard } from '../src/modules/auth/presentation/jwt-auth.guard.js';
import { RolesGuard } from '../src/modules/auth/presentation/roles.guard.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

// Explicit opt-in only. Migrate a disposable local database, never seed/mutate
// the development database or customer acceptance accounts. No email/FCM sent.
describe.skipIf(process.env.R1_POSTGRES_TEST !== '1')('R1 isolated PostgreSQL auth', () => {
  const name = `r1_auth_test_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  let maintenance: DataSource;
  let db: DataSource;
  let created = false;
  let auth: AuthService;
  let sessions: TypeOrmAuthSessionRepository;
  let jwt: JwtService;
  let tokens: JwtAccessTokenService;
  let passwordHash: string;
  let departmentId: string;
  let apiProcess: ChildProcess | undefined;
  let apiBaseUrl = '';
  const webOrigin = 'https://r1.development.invalid';

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('R1 PostgreSQL checks require an explicit local development database');
    }
    if (!/^r1_auth_test_[a-f0-9]{32}$/.test(name) || url.pathname === `/${name}`) throw new Error('Unsafe test database target');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() });
    await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`);
    created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    url.pathname = `/${name}`;
    if (applicationDataSource.options.type !== 'postgres') throw new Error('Expected PostgreSQL migrations');
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize();
    await db.runMigrations();
    const [department] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES ('R1-DEV-ONLY','R1 Development only') RETURNING id`);
    departmentId = department.id;
    const hasher = new BcryptPasswordHasher();
    passwordHash = await hasher.hash(password);
    sessions = new TypeOrmAuthSessionRepository(db);
    jwt = new JwtService({ secret: randomUUID(), signOptions: { expiresIn: 900 } });
    tokens = new JwtAccessTokenService(jwt);
    auth = new AuthService(new TypeOrmUserAuthenticationRepository(db.getRepository(UserEntity)), hasher,
      tokens, sessions, { send: (): Promise<LoginAlertResult> => Promise.resolve({ status: 'SKIPPED', note: 'R1_TEST_NO_EMAIL' }) }, new ConfigService());
    if (process.env.R1_API_TEST === '1') {
      const portProbe = createServer();
      portProbe.listen(0, '127.0.0.1');
      await once(portProbe, 'listening');
      const port = (portProbe.address() as AddressInfo).port;
      await new Promise<void>((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
      apiBaseUrl = `http://127.0.0.1:${port}/api`;
      apiProcess = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore', env: {
        ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: randomUUID().repeat(2),
        SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false',
        NODE_ENV: 'production', CORS_ORIGIN: webOrigin, TRUST_PROXY: 'true',
        EVIDENCE_STORAGE_DIR: `${process.cwd()}/storage/attendance`,
        BUSINESS_TRIP_EVIDENCE_STORAGE_DIR: `${process.cwd()}/storage/business-trips`,
      } });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (apiProcess.exitCode !== null) throw new Error('Isolated API exited; build Backend before R1_API_TEST');
        if (await fetch(`${apiBaseUrl}/health`).then(r => r.ok).catch(() => false)) return;
        await delay(100);
      }
      throw new Error('Isolated API readiness timed out');
    }
  }, 30_000);

  afterAll(async () => {
    if (apiProcess && apiProcess.exitCode === null) {
      const exited = once(apiProcess, 'exit');
      apiProcess.kill();
      await exited;
    }
    if (db?.isInitialized) await db.destroy();
    // Only the exact random database created above may be removed.
    if (created && maintenance?.isInitialized && /^r1_auth_test_[a-f0-9]{32}$/.test(name)) {
      await maintenance.query(`DROP DATABASE "${name}"`);
    }
    if (maintenance?.isInitialized) await maintenance.destroy();
  });

  async function account(role: RoleCode = RoleCode.Employee): Promise<{ id: string; email: string }> {
    const email = `r1-${randomUUID()}@development.invalid`;
    const [user] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id`, [email, passwordHash]);
    await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2`, [user.id, role]);
    await db.query(`INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES ($1,'R1 Development only',$2,$3)`,
      [randomUUID().slice(0, 28), user.id, departmentId]);
    return { ...user, email };
  }

  async function grant(userId: string, role: 'DEPARTMENT_HEAD' | 'TEAM_LEADER' = 'DEPARTMENT_HEAD'): Promise<string> {
    let teamId: string | null = null;
    if (role === 'TEAM_LEADER') {
      const [team] = await db.query<Array<{ id: string }>>(`INSERT INTO organization_teams(department_id,code,name,created_by) VALUES ($1,$2,'R1 Development only',$3) RETURNING id`, [departmentId, randomUUID().slice(0, 24).toUpperCase(), userId]);
      teamId = team.id;
    }
    const [row] = await db.query<Array<{ id: string }>>(`INSERT INTO organization_management_grants
      (user_id,role_code,department_id,team_id,appointment_type,valid_from,reason,created_by)
      VALUES ($1,$2,$3,$4,'OFFICIAL',now()-interval '1 day','R1 Development only',$1) RETURNING id`,
    [userId, role, role === 'DEPARTMENT_HEAD' ? departmentId : null, teamId]);
    return row.id;
  }

  function login(email: string, channel: 'WEB' | 'MOBILE' = 'MOBILE'): Promise<LoginResult> {
    const context: LoginContext = { clientType: channel, deviceId: randomUUID(), deviceName: 'R1 Development only', ipAddress: null, userAgent: null };
    return auth.login(email, password, context);
  }

  async function sid(result: LoginResult): Promise<string> { return (await tokens.verify(result.accessToken)).sid; }
  async function active(result: LoginResult): Promise<AuthSessionRecord | null> { return sessions.findActive(await sid(result), result.user.id); }

  async function httpLogin(email: string, channel: 'WEB' | 'MOBILE', path = '/auth/login'): Promise<Response> {
    return fetch(`${apiBaseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(channel === 'WEB' ? { Origin: webOrigin } : {}) },
      body: JSON.stringify({ email, password, clientType: channel, deviceId: randomUUID(), deviceName: 'R1 Development only' }) });
  }

  it.skipIf(process.env.R1_API_TEST !== '1')('real HTTP login returns Web HttpOnly cookies, refresh and logout clear matching paths', async () => {
    const user = await account(RoleCode.Admin);
    const logged = await httpLogin(user.email, 'WEB');
    expect(logged.status).toBe(200);
    const body = await logged.json() as Partial<LoginResult>;
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    const cookies = logged.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('Secure'))).toBe(true);
    expect(cookies.find(cookie => cookie.startsWith('refresh_token='))).toContain('Path=/api/auth');
    const cookieHeader = cookies.map(cookie => cookie.split(';')[0]).join('; ');
    expect((await fetch(`${apiBaseUrl}/auth/me`, { headers: { Cookie: cookieHeader } })).status).toBe(200);
    expect((await fetch(`${apiBaseUrl}/auth/admin/sessions`, { headers: { Cookie: cookieHeader } })).status).toBe(200);
    const refreshed = await fetch(`${apiBaseUrl}/auth/refresh`, { method: 'POST', headers: { Cookie: cookieHeader, 'Content-Type': 'application/json', Origin: webOrigin }, body: '{}' });
    expect(refreshed.status).toBe(200);
    const updated = refreshed.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
    const ended = await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: updated, Origin: webOrigin } });
    expect(ended.status).toBe(204);
    expect(ended.headers.getSetCookie().find(cookie => cookie.startsWith('refresh_token='))).toContain('Path=/api/auth');
    expect((await fetch(`${apiBaseUrl}/auth/me`, { headers: { Cookie: updated } })).status).toBe(401);
  });

  it.skipIf(process.env.R1_API_TEST !== '1')('Web cookie creation rejects missing/untrusted Origin even before the first session exists', async () => {
    const user = await account(RoleCode.Admin);
    for (const [path, origin] of [['/auth/login', undefined], ['/auth/login', 'https://untrusted.invalid'], ['/auth/login/', undefined], ['/AUTH/LOGIN', undefined]]) {
      const res = await fetch(`${apiBaseUrl}${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ email: user.email, password, clientType: 'WEB', deviceId: randomUUID(), deviceName: 'R1 Development only' }) });
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toHaveLength(0);
    }
    expect(await db.query<Array<{ id: string }>>('SELECT id FROM auth_sessions WHERE user_id=$1', [user.id])).toHaveLength(0);
    expect((await httpLogin(user.email, 'WEB')).status).toBe(200);
  });

  it.skipIf(process.env.R1_API_TEST !== '1')('real HTTP Mobile tokens authenticate but EMPLOYEE cannot read Admin history or revoke another SID', async () => {
    const user = await account();
    const logged = await httpLogin(user.email, 'MOBILE');
    expect(logged.status).toBe(200);
    expect(logged.headers.getSetCookie()).toHaveLength(0);
    const body = await logged.json() as LoginResult;
    expect(body.refreshToken).toBeTruthy();
    const headers = { Authorization: `Bearer ${body.accessToken}` };
    expect((await fetch(`${apiBaseUrl}/auth/me`, { headers })).status).toBe(200);
    expect((await fetch(`${apiBaseUrl}/auth/admin/sessions`, { headers })).status).toBe(403);
    expect((await fetch(`${apiBaseUrl}/auth/admin/sessions/${randomUUID()}/revoke`, { method: 'POST', headers })).status).toBe(403);
  });

  it.skipIf(process.env.R1_API_TEST !== '1')('real login limiter keys the parsed normalized account, not all coworkers behind the same IP', async () => {
    const first = await httpLogin(`r1-rate-${randomUUID()}@development.invalid`, 'WEB');
    const second = await httpLogin(`r1-rate-${randomUUID()}@development.invalid`, 'WEB');
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(first.headers.get('x-ratelimit-remaining')).toBe(second.headers.get('x-ratelimit-remaining'));
  });

  it.skipIf(process.env.R1_API_TEST !== '1')('real normalized-account limiter allows ten attempts then returns readable 429', async () => {
    const email = `r1-limit-${randomUUID()}@development.invalid`;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await httpLogin(attempt % 2 ? ` ${email.toUpperCase()} ` : email, 'WEB', attempt % 2 ? '/AUTH/LOGIN/' : '/auth/login');
      expect(result.status).toBe(401);
      expect(Number(result.headers.get('x-ratelimit-remaining'))).toBe(9 - attempt);
    }
    const blocked = await httpLogin(email, 'WEB');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(blocked.headers.get('access-control-allow-origin')).toBe(webOrigin);
    expect(await blocked.json()).toMatchObject({ code: 'AUTH_RATE_LIMITED' });
  });

  it('authenticates normalized identity with real bcrypt; wrong/unknown credentials create no sessions', async () => {
    const user = await account();
    const logged = await login(` ${user.email.toUpperCase()} `);
    expect(logged.user.id).toBe(user.id);
    const count = async (): Promise<string> => (await db.query<Array<{ count: string }>>('SELECT count(*) FROM auth_sessions'))[0].count;
    const initial = await count();
    const context: LoginContext = { clientType: 'MOBILE', deviceId: randomUUID(), deviceName: 'R1 Development only', ipAddress: null, userAgent: null };
    await expect(auth.login(user.email, 'wrong-password', context)).rejects.toMatchObject({ status: 401 });
    await expect(auth.login('missing@development.invalid', password, context)).rejects.toMatchObject({ status: 401 });
    expect(await count()).toBe(initial);
    expect(JSON.stringify(logged.user)).not.toContain(passwordHash);
  });

  it('rejects employee Web login without replacing the active Mobile session', async () => {
    const user = await account();
    const mobile = await login(user.email);
    await expect(login(user.email, 'WEB')).rejects.toMatchObject({ status: 403 });
    expect(await active(mobile)).not.toBeNull();
  });

  it('serializes simultaneous ordinary employee logins to one active session', async () => {
    const user = await account();
    const results = await Promise.all([login(user.email), login(user.email), login(user.email)]);
    const records = await Promise.all(results.map(active));
    expect(records.filter(Boolean)).toHaveLength(1);
    const rows = await db.query<Array<{ id: string }>>('SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
    expect(rows).toHaveLength(1);
  });

  it.each(['DEPARTMENT_HEAD', 'TEAM_LEADER'] as const)('%s keeps one Web and one Mobile; logout/revoke are per SID', async role => {
    const user = await account();
    await grant(user.id, role);
    const [web, mobile] = await Promise.all([login(user.email, 'WEB'), login(user.email)]);
    expect(web.user.portal?.homePath).toBe('/dashboard/managed');
    expect(await active(web)).not.toBeNull();
    expect(await active(mobile)).not.toBeNull();
    const replacement = await login(user.email);
    expect(await active(mobile)).toBeNull();
    expect(await active(web)).not.toBeNull();
    await auth.logout(await sid(replacement));
    expect(await active(web)).not.toBeNull();
    await auth.revokeSession(await sid(web));
    expect(await active(web)).toBeNull();
  });

  it('global Admin without a grant retains account-wide replacement', async () => {
    const user = await account(RoleCode.Admin);
    const web = await login(user.email, 'WEB');
    await login(user.email);
    expect(await active(web)).toBeNull();
  });

  it('rotates hashed refresh, preserves absolute expiry and detects previous-token reuse per SID', async () => {
    const user = await account();
    await grant(user.id);
    const web = await login(user.email, 'WEB');
    const mobile = await login(user.email);
    const refreshed = await auth.refresh(mobile.refreshToken);
    expect(refreshed.refreshToken).not.toBe(mobile.refreshToken);
    expect(refreshed.sessionExpiresAt).toBe(mobile.sessionExpiresAt);
    const stored = await active(refreshed);
    expect(stored?.refreshTokenHash).not.toContain(refreshed.refreshToken);
    await expect(auth.refresh(mobile.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await active(refreshed)).toBeNull();
    expect(await active(web)).not.toBeNull();
  });

  it('enforces Web idle and both absolute lifetimes without waiting 30 days', async () => {
    const user = await account();
    await grant(user.id);
    const web = await login(user.email, 'WEB');
    const mobile = await login(user.email);
    const delta = (result: LoginResult): number => Date.parse(result.sessionExpiresAt) - Date.now();
    expect(delta(web)).toBeGreaterThan(86_390_000);
    expect(delta(web)).toBeLessThanOrEqual(86_400_000);
    expect(delta(mobile)).toBeGreaterThan(2_591_990_000);
    expect(delta(mobile)).toBeLessThanOrEqual(2_592_000_000);
    await db.query(`UPDATE auth_sessions SET last_seen_at=now()-interval '30 minutes' WHERE id=$1`, [await sid(web)]);
    await expect(auth.refresh(web.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await active(mobile)).not.toBeNull();
    await db.query(`UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE id=$1`, [await sid(mobile)]);
    await expect(auth.refresh(mobile.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('session directory labels idle Web as expired, while idle Mobile stays active; reading does not revoke', async () => {
    const user = await account();
    await grant(user.id);
    const web = await login(user.email, 'WEB');
    const mobile = await login(user.email);
    const webId = await sid(web);
    const mobileId = await sid(mobile);
    await db.query(`UPDATE auth_sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=$1`, [user.id]);
    const listed = await auth.listSessions('another-admin-session');
    expect(listed.find(row => row.id === webId)).toMatchObject({ status: 'EXPIRED', revokedAt: null });
    expect(listed.find(row => row.id === mobileId)).toMatchObject({ status: 'ACTIVE', revokedAt: null });
    expect(await active(mobile)).not.toBeNull();
  });

  it('losing the last grant retires Web, preserves Mobile and regrant does not revive Web', async () => {
    const user = await account();
    const grantId = await grant(user.id);
    const web = await login(user.email, 'WEB');
    const mobile = await login(user.email);
    await db.query(`UPDATE organization_management_grants SET revoked_at=now(),revoked_by=$1,revocation_reason='R1 Development only' WHERE id=$2`, [user.id, grantId]);
    expect(await active(web)).toBeNull();
    expect(await active(mobile)).not.toBeNull();
    await grant(user.id);
    expect(await active(web)).toBeNull();
  });

  it.each(['users', 'employees'])('inactive %s retires both channels; reactivation does not revive sessions', async table => {
    const user = await account();
    await grant(user.id);
    const web = await login(user.email, 'WEB');
    const mobile = await login(user.email);
    const key = table === 'users' ? 'id' : 'user_id';
    const lifecycle = table === 'employees' ? ",employment_end_date=current_date,employment_status_reason='R1 Development only',status_changed_at=now(),status_changed_by=user_id" : '';
    await db.query(`UPDATE ${table} SET is_active=false${lifecycle} WHERE ${key}=$1`, [user.id]);
    expect(await active(mobile)).toBeNull();
    expect(await active(web)).toBeNull();
    await expect(login(user.email)).rejects.toMatchObject({ status: 401 });
    const restored = table === 'employees' ? ',employment_end_date=NULL,employment_status_reason=NULL' : '';
    await db.query(`UPDATE ${table} SET is_active=true${restored} WHERE ${key}=$1`, [user.id]);
    expect(await active(mobile)).toBeNull();
  });

  it('uses live roles, rejects forged/expired/wrong-owner JWT and protects ADMIN endpoints', async () => {
    const user = await account(RoleCode.Admin);
    const logged = await login(user.email, 'WEB');
    const guard = new JwtAuthGuard(tokens, auth);
    const request: { headers: { authorization: string }; user?: { roles: RoleCode[] } } = { headers: { authorization: `Bearer ${logged.accessToken}` } };
    const handler = Object.getOwnPropertyDescriptor(AuthController.prototype, 'listSessions')?.value as () => unknown;
    const context = { switchToHttp: () => ({ getRequest: (): typeof request => request }), getHandler: () => handler,
      getClass: () => AuthController } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    const rolesGuard = new RolesGuard(new Reflector());
    expect(rolesGuard.canActivate(context)).toBe(true);
    await db.query(`UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE code='CHIEF_ACCOUNTANT') WHERE user_id=$1`, [user.id]);
    await guard.canActivate(context);
    expect(request.user?.roles).toEqual([RoleCode.ChiefAccountant]);
    expect(() => rolesGuard.canActivate(context)).toThrow();
    request.headers.authorization = `Bearer ${logged.accessToken}corrupted`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    const payload = await tokens.verify(logged.accessToken);
    request.headers.authorization = `Bearer ${await jwt.signAsync({ sub: payload.sub, sid: payload.sid }, { expiresIn: -1 })}`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    const stranger = await account();
    await expect(auth.getAuthenticatedUser(stranger.id, payload.sid)).rejects.toMatchObject({ status: 401 });
  });
});
