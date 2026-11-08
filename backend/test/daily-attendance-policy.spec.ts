import { describe, expect, it } from 'vitest';
import { dailyAttendanceError, vietnamWorkDate } from '../src/modules/attendance/domain/daily-attendance-policy.js';

describe('R4 daily attendance limit', () => {
  it('permits only one pair across office and field, including legacy records', () => {
    const events = [{ eventType: 'CHECK_IN', attendanceType: 'BUSINESS_TRIP' }];
    expect(dailyAttendanceError([], 'CHECK_IN','OFFICE')).toBeNull();
    expect(dailyAttendanceError(events,'CHECK_IN','OFFICE')).toBe('DAILY_CHECK_IN_LIMIT');
    expect(dailyAttendanceError(events,'CHECK_OUT','OFFICE')).toBe('ATTENDANCE_TYPE_MISMATCH');
    expect(dailyAttendanceError(events,'CHECK_OUT','BUSINESS_TRIP')).toBeNull();
    events.push({ eventType: 'CHECK_OUT', attendanceType: 'BUSINESS_TRIP' });
    expect(dailyAttendanceError(events,'CHECK_IN','BUSINESS_TRIP')).toBe('DAILY_CHECK_IN_LIMIT');
    expect(dailyAttendanceError(events,'CHECK_OUT','BUSINESS_TRIP')).toBe('DAILY_CHECK_OUT_LIMIT');
  });
  it('requires a check-in in the current day', () => {
    expect(dailyAttendanceError([],'CHECK_OUT','OFFICE')).toBe('CHECK_IN_REQUIRED');
  });
  it('resets calendar eligibility exactly at midnight UTC+7, not device time', () => {
    expect(vietnamWorkDate(new Date('2026-10-09T16:59:59.999Z'))).toBe('2026-10-09');
    expect(vietnamWorkDate(new Date('2026-10-09T17:00:00Z'))).toBe('2026-10-10');
  });
});
