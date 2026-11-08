import { describe, expect, it } from 'vitest';
import { AttendanceRiskFlag } from '../src/modules/attendance/domain/attendance-risk-flag.js';
import { calculateWorkSummary, evaluateScheduleRisk, localMinutes } from '../src/modules/attendance/domain/schedule-policy.js';

const schedule = {
  startTime: '08:00',
  endTime: '17:00',
  lateToleranceMinutes: 3,
  earlyLeaveToleranceMinutes: 0,
  requiredWorkMinutes: 480,
};

describe('customer schedule policy', () => {
  it('allows early check-in and flags check-in after the three-minute tolerance', () => {
    expect(evaluateScheduleRisk('CHECK_IN', 7 * 60 + 30, schedule)).toEqual([]);
    expect(evaluateScheduleRisk('CHECK_IN', 8 * 60 + 3, schedule)).toEqual([]);
    expect(evaluateScheduleRisk('CHECK_IN', 8 * 60 + 4, schedule)).toEqual([AttendanceRiskFlag.Late]);
  });

  it('flags early leave, counts a full day at eight hours but never invents OT from late checkout', () => {
    expect(evaluateScheduleRisk('CHECK_OUT', 16 * 60 + 59, schedule)).toEqual([AttendanceRiskFlag.EarlyLeave]);
    const summary = calculateWorkSummary('2026-09-22T01:00:00.000Z', '2026-09-22T10:30:00.000Z', schedule);
    expect(summary.workedMinutes).toBe(570);
    expect(summary.isFullWorkday).toBe(true);
    expect(summary.overtimeMinutes).toBe(0);
  });

  it('flags late strictly after three minutes including seconds, using Vietnam time', () => {
    expect(evaluateScheduleRisk('CHECK_IN', localMinutes(new Date('2026-10-09T01:03:00Z')), schedule)).toEqual([]);
    expect(evaluateScheduleRisk('CHECK_IN', localMinutes(new Date('2026-10-09T01:03:00.001Z')), schedule)).toEqual([AttendanceRiskFlag.Late]);
    expect(localMinutes(new Date('2026-10-08T17:00:00Z'))).toBe(0);
  });

  it('honors configured early-leave and late tolerances at exact boundaries', () => {
    expect(evaluateScheduleRisk('CHECK_OUT', 17 * 60, schedule)).toEqual([]);
    expect(evaluateScheduleRisk('CHECK_OUT', 17 * 60 - 1 / 60, schedule)).toEqual([AttendanceRiskFlag.EarlyLeave]);
    expect(evaluateScheduleRisk('CHECK_OUT', 16 * 60 + 55, { ...schedule, earlyLeaveToleranceMinutes: 5 })).toEqual([]);
    expect(evaluateScheduleRisk('CHECK_IN', 8 * 60 + 1 / 60, { ...schedule, lateToleranceMinutes: 0 })).toEqual([AttendanceRiskFlag.Late]);
  });

  it.each([
    ['2026-10-09T01:00:00Z', '2026-10-09T08:59:59Z', 479, false],
    ['2026-10-09T01:00:00Z', '2026-10-09T09:00:00Z', 480, true],
    ['2026-10-09T01:00:00Z', null, 0, false],
    [null, '2026-10-09T09:00:00Z', 0, false],
    ['2026-10-09T09:00:00Z', '2026-10-09T01:00:00Z', 0, false],
    ['invalid', '2026-10-09T09:00:00Z', 0, false],
  ])('summarizes %s -> %s without NaN or automatic OT', (start, end, minutes, full) => {
    expect(calculateWorkSummary(start, end, schedule)).toMatchObject({ workedMinutes: minutes, isFullWorkday: full, overtimeMinutes: 0 });
  });

  it('uses personal required minutes and permits early check-in without deducting a fictitious break', () => {
    expect(calculateWorkSummary('2026-10-09T00:30:00Z', '2026-10-09T08:30:00Z', { ...schedule, requiredWorkMinutes: 500 })).toMatchObject({ workedMinutes: 480, requiredWorkMinutes: 500, isFullWorkday: false });
  });
});
