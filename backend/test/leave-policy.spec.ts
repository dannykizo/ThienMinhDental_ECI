import { describe, expect, it } from 'vitest';
import {
  availableLeaveMinutes,
  canCancelLeave,
  isValidLeaveDurationInput,
  minutesBetween,
  satisfiesMinimumNotice,
} from '../src/modules/leave/domain/leave-policy.js';

describe('configurable leave policy', () => {
  it('only accepts partial-day requests enabled by the selected policy', () => {
    expect(isValidLeaveDurationInput({
      allowHalfDay: true,
      allowHourly: false,
      durationType: 'HALF_DAY',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      halfDayPeriod: 'AM',
    })).toBe(true);
    expect(isValidLeaveDurationInput({
      allowHalfDay: false,
      allowHourly: true,
      durationType: 'HALF_DAY',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      halfDayPeriod: 'PM',
    })).toBe(false);
    expect(isValidLeaveDurationInput({
      allowHalfDay: true,
      allowHourly: true,
      durationType: 'HOURS',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      startTime: '08:00',
      endTime: '10:00',
    })).toBe(false);
  });

  it('calculates hourly duration and available balance in minutes', () => {
    expect(minutesBetween('08:15', '11:45')).toBe(210);
    expect(availableLeaveMinutes({
      entitlement: 5760,
      carryOver: 480,
      adjustments: -240,
      approved: 960,
      pending: 480,
    })).toBe(4560);
  });

  it('enforces notice and approved-cancellation policy', () => {
    expect(satisfiesMinimumNotice('2026-10-03', '2026-10-01', 2)).toBe(true);
    expect(satisfiesMinimumNotice('2026-10-02', '2026-10-01', 2)).toBe(false);
    expect(canCancelLeave('SUBMITTED', false)).toBe(true);
    expect(canCancelLeave('APPROVED', false)).toBe(false);
    expect(canCancelLeave('APPROVED', true)).toBe(true);
    expect(canCancelLeave('CANCELLED', true)).toBe(false);
  });
});
