import { describe, expect, it } from 'vitest';
import { canReviewExplanation, validateEvidence, validExplanationDate } from '../src/modules/attendance/domain/explanation-policy.js';

describe('attendance explanation policy', () => {
  const completeEvidence = {
    evidenceImageReference: 'evidence/attendance/photo.jpg',
    evidenceCapturedAt: '2026-09-22T08:00:00+07:00',
    evidenceLatitude: 10.7769,
    evidenceLongitude: 106.7009,
  };

  it('accepts optional evidence, including an attached image without time or GPS', () => {
    expect(validateEvidence('GPS_RISK', completeEvidence)).toBe(true);
    expect(validateEvidence('GPS_RISK', {})).toBe(true);
    expect(validateEvidence('GPS_RISK', { evidenceImageReference: 'photo.jpg' })).toBe(true);
  });

  it('accepts text-only non-GPS explanations but rejects partial evidence', () => {
    expect(validateEvidence('MISSING_CHECK_OUT', {})).toBe(true);
    expect(validateEvidence('MISSING_CHECK_OUT', { evidenceLatitude: 10.7 })).toBe(false);
    expect(validateEvidence('OTHER', { evidenceCapturedAt: '2026-10-06T08:00:00Z' })).toBe(false);
    expect(validateEvidence('OTHER', { evidenceImageReference: 'photo.jpg', evidenceLatitude: 10.7 })).toBe(false);
  });

  it('only permits review after an employee submission', () => {
    expect(canReviewExplanation('SUBMITTED')).toBe(true);
    expect(canReviewExplanation('REQUESTED')).toBe(false);
    expect(canReviewExplanation('APPROVED')).toBe(false);
    expect(canReviewExplanation('REJECTED')).toBe(false);
  });

  it('requires an actual calendar day, not a normalized invalid date or timestamp', () => {
    expect(validExplanationDate('2026-10-06')).toBe(true);
    expect(validExplanationDate('2024-02-29')).toBe(true);
    expect(validExplanationDate('2026-02-29')).toBe(false);
    expect(validExplanationDate('2026-13-01')).toBe(false);
    expect(validExplanationDate('2026-10-06T00:00:00Z')).toBe(false);
  });
});
