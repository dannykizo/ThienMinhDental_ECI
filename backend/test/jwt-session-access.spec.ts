import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../src/modules/auth/application/auth.service.js';
import type { AccessTokenService } from '../src/modules/auth/application/auth.ports.js';
import { JwtAuthGuard } from '../src/modules/auth/presentation/jwt-auth.guard.js';

function harness(getAuthenticatedUser: ReturnType<typeof vi.fn>): { guard: JwtAuthGuard; context: ExecutionContext; request: object; verify: ReturnType<typeof vi.fn> } {
  const verify = vi.fn().mockResolvedValue({ sub: 'user', sid: 'session', roles: ['ADMIN'] });
  const request = { headers: { authorization: 'Bearer development-only' } };
  const context = { switchToHttp: () => ({ getRequest: (): object => request }) } as unknown as ExecutionContext;
  return { guard: new JwtAuthGuard({ verify } as unknown as AccessTokenService, { getAuthenticatedUser } as unknown as AuthService), context, request, verify };
}

describe('PQ2 current session authorization guard', () => {
  it('uses server-side user roles/access instead of JWT role snapshots', async () => {
    const user = { id: 'user', roles: ['EMPLOYEE'] };
    const current = vi.fn().mockResolvedValue(user);
    const { guard, context, request } = harness(current);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({ user, authSessionId: 'session' });
    expect(current).toHaveBeenCalledWith('user', 'session');
  });
  it('preserves genuine revocation errors', async () => {
    const { guard, context } = harness(vi.fn().mockRejectedValue(new UnauthorizedException({ code: 'SESSION_REVOKED' })));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
  });
  it('does not disguise a database outage as invalid credentials', async () => {
    const unavailable = new Error('Development simulated database outage');
    const { guard, context } = harness(vi.fn().mockRejectedValue(unavailable));
    await expect(guard.canActivate(context)).rejects.toBe(unavailable);
  });
  it('still rejects an invalid JWT before querying the session', async () => {
    const current = vi.fn();
    const { guard, context, verify } = harness(current);
    verify.mockRejectedValue(new Error('Invalid signature'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(current).not.toHaveBeenCalled();
  });
});
