import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { AnnouncementsService } from '../src/modules/announcements/announcements.service.js';
import type { AnnouncementPushSender } from '../src/modules/announcements/application/announcement-push.sender.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

describe('push registration requires the current Mobile device', () => {
  it('refuses a missing/revoked/expired Mobile session before changing tokens', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const getRepository = vi.fn();
    const manager = { query, getRepository };
    const db = { transaction: (fn: (value: typeof manager) => unknown): unknown => fn(manager) };
    const service = new AnnouncementsService(db as unknown as DataSource, {
      isConfigured: () => false,
    } as AnnouncementPushSender);
    await expect(service.registerPushDevice({ id: 'user', employeeId: 'employee',
      email: 'development-only@example.invalid', displayName: 'Development only', roles: [RoleCode.Employee] },
      { deviceId: 'old-device', platform: 'ANDROID', token: 'development-only-fake-token' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(getRepository).not.toHaveBeenCalled();
    const sessionQuery = query.mock.calls[1][0] as string;
    expect(sessionQuery).toContain("s.client_type='MOBILE'");
    expect(sessionQuery).toContain('s.revoked_at IS NULL');
    expect(sessionQuery).toContain('s.expires_at>now()');
    expect(sessionQuery).toContain('s.device_id=$2');
  });
});
