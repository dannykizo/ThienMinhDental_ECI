import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

const response = (status: number, body: unknown = {}): Response => new Response(JSON.stringify(body), { status });

async function client(): Promise<typeof import('../../frontend/lib/auth-api.js')> {
  // Separate module instances model tabs; only cookies and Web Locks are shared.
  vi.resetModules();
  return import('../../frontend/lib/auth-api.js');
}

function browser(withLocks = true): { dispatchEvent: Mock } {
  let tail = Promise.resolve();
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const result = tail.then(callback);
    tail = result.then(() => undefined, () => undefined);
    return result;
  });
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('navigator', withLocks ? { locks: { request } } : {});
  return { dispatchEvent };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('R1 Web cookie refresh', () => {
  it('lets the browser set multipart boundaries while retaining JSON defaults', async () => {
    browser();
    const { apiRequest } = await client();
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(response(200)));
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData(); form.append('expectedVersion', 'none');
    await apiRequest('/employees/development-only/portrait', { method: 'POST', body: form });
    await apiRequest('/normal-json', { method: 'POST', body: '{}' });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Content-Type');
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
    expect(fetchMock.mock.calls[1][1]?.headers).toHaveProperty('Content-Type', 'application/json');
  });
  it('coordinates two tabs without replaying the previous refresh cookie', async () => {
    browser();
    const first = await client();
    const second = await client();
    let validAccess = false;
    let refreshVersion = 0;
    let revoked = false;
    let rotations = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        const sentVersion = refreshVersion;
        rotations++;
        await Promise.resolve();
        if (sentVersion !== refreshVersion) { revoked = true; return response(401); }
        refreshVersion++;
        validAccess = true;
        return response(200, { user: {} });
      }
      return response(validAccess && !revoked ? 200 : 401, { user: {} });
    }));
    const results = await Promise.allSettled([first.apiRequest('/protected'), second.apiRequest('/protected')]);
    expect(results.map(item => item.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(rotations).toBe(1);
    expect(revoked).toBe(false);
  });

  it('deduplicates requests in one tab, including the compatibility fallback', async () => {
    browser(false);
    const { apiRequest } = await client();
    let valid = false;
    let rotations = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) { rotations++; await Promise.resolve(); valid = true; return response(200); }
      return response(valid ? 200 : 401);
    }));
    await Promise.all([apiRequest('/one'), apiRequest('/two')]);
    expect(rotations).toBe(1);
  });

  it.each([500, 502, 503, 429])('preserves the session when refresh returns %s', async status => {
    const { dispatchEvent } = browser(false);
    const { apiRequest } = await client();
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(response(url.endsWith('/auth/refresh') ? status : 401))));
    await expect(apiRequest('/protected')).rejects.toMatchObject({ status });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves the session on a refresh network failure', async () => {
    const { dispatchEvent } = browser(false);
    const { apiRequest } = await client();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) return Promise.reject(new TypeError('Network unavailable'));
      return Promise.resolve(response(401));
    }));
    await expect(apiRequest('/protected')).rejects.toThrow('Network unavailable');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('signals expiry only when refresh is rejected with 401', async () => {
    const { dispatchEvent } = browser(false);
    const { apiRequest } = await client();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response(401, { code: 'SESSION_REVOKED' }))));
    await expect(apiRequest('/protected')).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it('does not refresh or end the employee session for a business 403', async () => {
    const { dispatchEvent } = browser();
    const { apiRequest } = await client();
    const fetchMock = vi.fn(() => Promise.resolve(response(403)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/admin-only')).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not rotate cookies when the probe fails with a server error', async () => {
    const { dispatchEvent } = browser();
    const { apiRequest } = await client();
    const fetchMock = vi.fn((url: string) => Promise.resolve(response(url.endsWith('/auth/me') ? 503 : 401)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/protected')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/refresh'))).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
