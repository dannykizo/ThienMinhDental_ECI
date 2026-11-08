import { describe, expect, it } from 'vitest';
import { canReviewLeave, hasValidLeaveReviewNote, isValidLeaveDateRange } from '../src/modules/leave/domain/leave-status.js';

describe('leave request policy', () => {
  it('accepts an inclusive date range and rejects a reversed range', () => {
    expect(isValidLeaveDateRange('2026-09-22', '2026-09-22')).toBe(true);
    expect(isValidLeaveDateRange('2026-09-22', '2026-09-23')).toBe(true);
    expect(isValidLeaveDateRange('2026-09-23', '2026-09-22')).toBe(false);
  });

  it('allows one review only while the request is submitted', () => {
    expect(canReviewLeave('SUBMITTED')).toBe(true);
    expect(canReviewLeave('APPROVED')).toBe(false);
    expect(canReviewLeave('REJECTED')).toBe(false);
  });
  it('requires real calendar dates, not timestamps or normalized invalid dates', () => {
    expect(isValidLeaveDateRange('2028-02-29', '2028-02-29')).toBe(true);
    for (const value of ['2026-02-29', '2026-02-31', '2026-01-01T08:00:00Z', 'invalid']) expect(isValidLeaveDateRange(value, value)).toBe(false);
  });

  it('requires a meaningful reason for rejection but not approval', () => {
    expect(hasValidLeaveReviewNote('APPROVED')).toBe(true);
    expect(hasValidLeaveReviewNote('REJECTED', 'Không phù hợp lịch trực')).toBe(true);
    expect(hasValidLeaveReviewNote('REJECTED', '  ')).toBe(false);
  });
});
