import { describe, expect, it } from 'vitest';
import { canReviewExplanation, validateEvidence } from '../src/modules/attendance/domain/explanation-policy.js';

describe('attendance explanation policy', () => {
  const completeEvidence = {
    evidenceImageReference: 'evidence/attendance/photo.jpg',
    evidenceCapturedAt: '2026-09-22T08:00:00+07:00',
    evidenceLatitude: 10.7769,
    evidenceLongitude: 106.7009,
  };

  it('requires complete image, time and coordinates for GPS risk', () => {
    expect(validateEvidence('GPS_RISK', completeEvidence)).toBe(true);
    expect(validateEvidence('GPS_RISK', { evidenceImageReference: 'photo.jpg' })).toBe(false);
  });

  it('accepts text-only non-GPS explanations but rejects partial evidence', () => {
    expect(validateEvidence('MISSING_CHECK_OUT', {})).toBe(true);
    expect(validateEvidence('MISSING_CHECK_OUT', { evidenceLatitude: 10.7 })).toBe(false);
  });

  it('only permits review after an employee submission', () => {
    expect(canReviewExplanation('SUBMITTED')).toBe(true);
    expect(canReviewExplanation('REQUESTED')).toBe(false);
    expect(canReviewExplanation('APPROVED')).toBe(false);
  });
});
