import { describe, expect, it, vi, type Mock } from 'vitest';
import type { DataSource } from 'typeorm';
import { AuthClientType, AuthSessionEntity } from '../src/database/entities/auth-session.entity.js';
import { TypeOrmAuthSessionRepository } from '../src/modules/auth/infrastructure/typeorm-auth-session.repository.js';

const liveGrant = {
  id: 'grant', userId: 'user', roleCode: 'TEAM_LEADER', departmentId: 'department', teamId: 'team',
  eligible: true, validFrom: new Date('2020-01-01T00:00:00Z'), validUntil: null,
  createdAt: new Date('2020-01-01T00:00:00Z'), revokedAt: null as Date | null,
};
const entity = {
  id: 'session', userId: 'user', clientType: AuthClientType.Web,
  signedInAt: new Date(), expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(),
} as AuthSessionEntity;

interface RepositoryHarness {
  service: TypeOrmAuthSessionRepository;
  repository: {
    update: Mock; create: Mock; save: Mock; exists: Mock;
    findOne: Mock<() => Promise<AuthSessionEntity | null>>;
  };
  query: Mock;
}

function harness(grants: typeof liveGrant[] = [], active = true): RepositoryHarness {
  const repository = {
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    create: vi.fn((input: Partial<AuthSessionEntity>) => input),
    save: vi.fn((input: Partial<AuthSessionEntity>) => Promise.resolve({ ...entity, ...input })),
    exists: vi.fn().mockResolvedValue(false),
    findOne: vi.fn().mockResolvedValue(entity),
  };
  const query = vi.fn((sql: string) => {
    if (sql.includes('organization_management_grants')) return Promise.resolve(grants);
    return Promise.resolve([{ active, roles: ['EMPLOYEE'] }]);
  });
  const manager = { query, getRepository: (): typeof repository => repository };
  const transaction = vi.fn((callback: (value: unknown) => Promise<unknown>) => callback(manager));
  const service = new TypeOrmAuthSessionRepository({ manager, transaction, getRepository: () => repository } as unknown as DataSource);
  return { service, repository, query };
}

describe('PQ2 persistence-backed channel sessions', () => {
  it('locks the account before selecting a fresh grant policy and replacing the same channel', async () => {
    const { service, repository, query } = harness([liveGrant]);
    await service.replaceActiveSession('user', { clientType: 'WEB', deviceId: 'dev-only', deviceName: 'Development only', ipAddress: null, userAgent: null }, new Date(), 'hash');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF u');
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(repository.update.mock.invocationCallOrder[0]);
    expect(repository.update.mock.calls[0][0]).toMatchObject({ userId: 'user', clientType: 'WEB' });
  });

  it('ordinary employee Mobile login still replaces account-wide, not merely the Mobile channel', async () => {
    const { service, repository } = harness();
    await service.replaceActiveSession('user', { clientType: 'MOBILE', deviceId: 'dev-only', deviceName: 'Development only', ipAddress: null, userAgent: null }, new Date(), 'hash');
    expect(repository.update.mock.calls[0][0]).toHaveProperty('userId', 'user');
    expect(repository.update.mock.calls[0][0]).not.toHaveProperty('clientType');
  });

  it('denies ordinary employee Web login before revoking or creating any session', async () => {
    const { service, repository } = harness();
    await expect(service.replaceActiveSession('user', { clientType: 'WEB', deviceId: 'dev-only', deviceName: 'Development only', ipAddress: null, userAgent: null }, new Date(), 'hash'))
      .rejects.toMatchObject({ response: { code: 'WEB_ACCESS_DENIED' } });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('grant loss retires only Web, leaving the employee Mobile session usable', async () => {
    const { service, repository } = harness([{ ...liveGrant, revokedAt: new Date() }]);
    repository.findOne.mockResolvedValue({ ...entity, clientType: AuthClientType.Mobile });
    await expect(service.findActive('session', 'user')).resolves.toMatchObject({ clientType: 'MOBILE' });
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user', clientType: 'WEB' }), expect.objectContaining({ revokeReason: 'MANAGEMENT_ACCESS_ENDED' }));
  });

  it('inactive accounts retire both channels rather than preserving unauthorized Mobile access', async () => {
    const { service, repository } = harness([liveGrant], false);
    await expect(service.findActive('session', 'user')).resolves.toBeNull();
    expect(repository.update.mock.calls[0][0]).not.toHaveProperty('clientType');
    expect(repository.update.mock.calls[0][1]).toHaveProperty('revokeReason', 'SESSION_USER_UNAVAILABLE');
  });
});
