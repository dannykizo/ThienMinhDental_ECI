import { describe, expect, it } from 'vitest';
import { canAcknowledgeAnnouncement, canTransitionAnnouncement } from '../src/modules/announcements/domain/announcement-status.js';

describe('announcement policy', () => {
  it('supports draft publication/cancellation and published withdrawal', () => {
    expect(canTransitionAnnouncement('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransitionAnnouncement('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionAnnouncement('PUBLISHED', 'WITHDRAWN')).toBe(true);
  });

  it('rejects republishing and terminal transitions', () => {
    expect(canTransitionAnnouncement('PUBLISHED', 'CANCELLED')).toBe(false);
    expect(canTransitionAnnouncement('WITHDRAWN', 'PUBLISHED')).toBe(false);
    expect(canTransitionAnnouncement('CANCELLED', 'PUBLISHED')).toBe(false);
  });

  it('only acknowledges important published announcements', () => {
    expect(canAcknowledgeAnnouncement('PUBLISHED', true)).toBe(true);
    expect(canAcknowledgeAnnouncement('PUBLISHED', false)).toBe(false);
    expect(canAcknowledgeAnnouncement('WITHDRAWN', true)).toBe(false);
  });
});
