import { describe, expect, it } from 'vitest';
import {
  businessTripPeriod,
  formatBusinessTripCode,
} from '../src/modules/business-trips/domain/business-trip-code.js';

describe('business trip code', () => {
  it('uses the issue month in the business timezone', () => {
    expect(businessTripPeriod(new Date('2026-09-30T18:30:00.000Z'))).toBe(
      '202610',
    );
  });

  it('formats a readable monthly sequence without truncating large values', () => {
    expect(formatBusinessTripCode('202609', 12)).toBe('CT-202609-0012');
    expect(formatBusinessTripCode('202609', 10000)).toBe('CT-202609-10000');
  });
});
