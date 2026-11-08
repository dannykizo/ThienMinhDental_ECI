import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataSource, MigrationInterface } from 'typeorm';
import { ArgumentsHost, Logger, type HttpServer } from '@nestjs/common';
import { OperationalExceptionFilter } from '../src/common/security/operational-exception.filter.js';
import { databaseMigrations } from '../src/database/migration-registry.js';
import { hasPendingMigrations } from '../src/database/migration-status.js';
import { HealthController } from '../src/health/health.controller.js';
import { onRequest } from '../../frontend/functions/api/[[path]].js';

const names = databaseMigrations.map(migration => ({ name: (new migration() as MigrationInterface).name ?? migration.name }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('R14 operational status and tunnel failures', () => {
  it('production DB errors remain retryable without logging SQL or private parameters', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined), reply = vi.fn();
    const response = { getHeader: (): string => 'R14-request-id' }, request = { method: 'POST', path: '/api/attendance/events' };
    const http = { getResponse: (): typeof response => response, getRequest: (): typeof request => request };
    const host = { switchToHttp: (): typeof http => http } as unknown as ArgumentsHost;
    new OperationalExceptionFilter({ reply } as unknown as HttpServer).catch({ driverError: { code: 'ECONNREFUSED' }, query: 'PRIVATE SQL', parameters: ['PRIVATE TOKEN'] }, host);
    expect(reply).toHaveBeenCalledWith(response, expect.objectContaining({ code: 'DATA_SERVICE_UNAVAILABLE', requestId: 'R14-request-id' }), 503);
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE');
    new OperationalExceptionFilter({ reply } as unknown as HttpServer).catch({ driverError: { code: 'ENOTFOUND' } }, host);
    new OperationalExceptionFilter({ reply } as unknown as HttpServer).catch({ errors: [{ code: 'ECONNREFUSED' }] }, host);
    expect(reply.mock.calls.every(call => call[2] === 503)).toBe(true);
  });
  it('unknown internal errors are sanitized, not treated as revoked sessions', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const reply = vi.fn(), response = { getHeader: (): undefined => undefined }, request = { method: 'GET', path: '/api/reporting/monthly' };
    const http = { getResponse: (): typeof response => response, getRequest: (): typeof request => request };
    const host = { switchToHttp: (): typeof http => http } as unknown as ArgumentsHost;
    new OperationalExceptionFilter({ reply } as unknown as HttpServer).catch(new Error('PRIVATE CREDENTIAL'), host);
    expect(reply).toHaveBeenCalledWith(response, expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }), 500);
    expect(JSON.stringify(reply.mock.calls)).not.toContain('PRIVATE');
  });
  it('body-parser errors keep their client status without reflecting input or logging it', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined), reply = vi.fn();
    const http = { getResponse: (): object => ({}), getRequest: (): object => ({}) };
    const host = { switchToHttp: (): typeof http => http } as unknown as ArgumentsHost;
    for (const [type, statusCode] of [['entity.parse.failed', 400], ['entity.too.large', 413], ['charset.unsupported', 415]] as const) {
      new OperationalExceptionFilter({ reply } as unknown as HttpServer).catch({ type, statusCode, message: 'PRIVATE JSON INPUT' }, host);
      expect(reply.mock.calls.at(-1)?.[2]).toBe(statusCode);
    }
    expect(log).not.toHaveBeenCalled(); expect(JSON.stringify(reply.mock.calls)).not.toContain('PRIVATE');
  });
  it('missing migration ledger is pending without creating tables', async () => {
    const query = vi.fn().mockResolvedValue([{ present: false }]);
    expect(await hasPendingMigrations({ query })).toBe(true); expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('SELECT to_regclass');
  });
  it('full registry is ready, including migrations using their constructor name', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce(names);
    expect(await hasPendingMigrations({ query })).toBe(false);
    expect(query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true);
  });
  it('one unapplied migration cannot be hidden by extra unknown rows', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce([...names.slice(1), { name: 'Unknown' }]);
    expect(await hasPendingMigrations({ query })).toBe(true);
  });
  it('liveness is independent; readiness is 503 for missing schema or DB error', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([{ present: false }]) };
    const controller = new HealthController(db as unknown as DataSource);
    expect(controller.getLiveness().status).toBe('ok');
    await expect(controller.getReadiness()).rejects.toMatchObject({ status: 503 });
    db.query.mockRejectedValue(new Error('PRIVATE DATABASE DIAGNOSTIC'));
    await expect(controller.getReadiness()).rejects.toMatchObject({ response: { status: 'unavailable' } });
  });
  it('readiness succeeds after all registry names exist', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce(names);
    expect((await new HealthController({ query } as unknown as DataSource).getReadiness()).status).toBe('ok');
  });
  it('missing/invalid tunnel origin returns a safe retryable outage without fetch', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const origin of [undefined, 'not a URL', 'http://untrusted.test', 'https://user:password@untrusted.test']) {
      const response = await onRequest({ env: { BACKEND_ORIGIN: origin }, request: new Request('https://demo.invalid/api/health') });
      expect(response.status).toBe(503); expect(await response.text()).not.toContain('password');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('network loss does not turn into an auth failure or replay a POST', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('PRIVATE NETWORK DETAILS')); vi.stubGlobal('fetch', fetcher);
    const response = await onRequest({ env: { BACKEND_ORIGIN: 'https://origin.invalid' }, request: new Request('https://demo.invalid/api/leave-requests/mine', { method: 'POST', body: '{}' }) });
    expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('PRIVATE'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounded gateway timeout returns 503, without waiting forever or retrying', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((request: Request) => new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('Timeout'))))));
    const pending = onRequest({ env: { BACKEND_ORIGIN: 'https://origin.invalid' }, request: new Request('https://demo.invalid/api/health') });
    await vi.advanceTimersByTimeAsync(25_000); expect((await pending).status).toBe(503);
  });
  it('upstream HTML 502 is normalized; genuine JSON 401 is not hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('upstream private error', { status: 502 })).mockResolvedValueOnce(Response.json({ code: 'AUTHENTICATION_REQUIRED' }, { status: 401 })));
    const request = (): Promise<Response> => onRequest({ env: { BACKEND_ORIGIN: 'https://origin.invalid' }, request: new Request('https://demo.invalid/api/auth/me') });
    expect((await request()).status).toBe(503); const denied = await request(); expect(denied.status).toBe(401); expect(await denied.json()).toEqual({ code: 'AUTHENTICATION_REQUIRED' });
  });
  it('proxy preserves Origin, query and cookie headers, without following redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal('fetch', fetcher);
    await onRequest({ env: { BACKEND_ORIGIN: 'https://origin.invalid' }, request: new Request('https://demo.invalid/api/auth/logout?check=1', { method: 'POST', body: '{}', headers: { Origin: 'https://demo.invalid', Cookie: 'access_token=SYNTHETIC' } }) });
    const forwarded = fetcher.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe('https://origin.invalid/api/auth/logout?check=1');
    expect(forwarded.headers.get('origin')).toBe('https://demo.invalid'); expect(forwarded.redirect).toBe('manual');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
