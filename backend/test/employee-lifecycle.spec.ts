import { describe, expect, it } from 'vitest';
import {
  canChangeEmployeeStatus,
  hasValidLifecycleReason,
  isValidLifecycleEffectiveDate,
} from '../src/modules/employees/domain/employee-lifecycle.js';

describe('employee lifecycle policy', () => {
  it('only accepts an actual status transition', () => {
    expect(canChangeEmployeeStatus(true, false)).toBe(true);
    expect(canChangeEmployeeStatus(false, true)).toBe(true);
    expect(canChangeEmployeeStatus(true, true)).toBe(false);
  });

  it('rejects future or malformed effective dates', () => {
    expect(isValidLifecycleEffectiveDate('2026-09-26', '2026-09-26')).toBe(true);
    expect(isValidLifecycleEffectiveDate('2026-09-27', '2026-09-26')).toBe(false);
    expect(isValidLifecycleEffectiveDate('26/09/2026', '2026-09-26')).toBe(false);
  });

  it('requires a meaningful trimmed lifecycle reason', () => {
    expect(hasValidLifecycleReason('Hết hợp đồng')).toBe(true);
    expect(hasValidLifecycleReason('     ')).toBe(false);
  });
});
