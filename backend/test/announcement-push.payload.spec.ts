import { describe, expect, it } from 'vitest';
import { announcementPushPayload } from '../src/modules/announcements/infrastructure/announcement-push.payload.js';

describe('FCM notification transport', () => {
  it('bounds UTF-8 payload without corrupting emoji and preserves the inbox identity', () => {
    const input = { announcementId: '8d19f897-9a76-4094-89d2-69ed3542d134',
      body: '🔔'.repeat(10000), title: '🔔'.repeat(200), requiresAcknowledgement: true };
    const payload = announcementPushPayload(input, '916ac6d9-bdc6-4d9e-9a9c-ac97748dfe38');
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(4096);
    expect(payload.notification?.body).toBe('🔔'.repeat(400) + '…');
    expect(input.body).toHaveLength(20000);
    expect(payload.data?.announcementId).toBe(input.announcementId);
    expect(payload.data?.recipientUserId).toBe('916ac6d9-bdc6-4d9e-9a9c-ac97748dfe38');
    expect(payload.android?.notification?.channelId).toBe('announcements');
    expect(payload.android?.notification?.tag).toBe(input.announcementId);
    expect(payload.android?.notification?.visibility).toBe('private');
  });
});
