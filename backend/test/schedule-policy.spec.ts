import { describe, expect, it } from 'vitest';
import { AttendanceRiskFlag } from '../src/modules/attendance/domain/attendance-risk-flag.js';
import { calculateWorkSummary, evaluateScheduleRisk } from '../src/modules/attendance/domain/schedule-policy.js';

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

  it('flags early leave, counts a full day at eight hours and overtime after schedule end', () => {
    expect(evaluateScheduleRisk('CHECK_OUT', 16 * 60 + 59, schedule)).toEqual([AttendanceRiskFlag.EarlyLeave]);
    const summary = calculateWorkSummary('2026-09-22T01:00:00.000Z', '2026-09-22T10:30:00.000Z', schedule);
    expect(summary.workedMinutes).toBe(570);
    expect(summary.isFullWorkday).toBe(true);
    expect(summary.overtimeMinutes).toBe(30);
  });
});
