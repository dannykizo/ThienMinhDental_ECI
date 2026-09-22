import { describe, expect, it, vi } from 'vitest';
import { AttendanceRecord } from '../src/modules/attendance/domain/attendance-record.js';
import { AttendanceStatus } from '../src/modules/attendance/domain/attendance-status.js';
import { AttendanceType } from '../src/modules/attendance/domain/attendance-type.js';

describe('AttendanceRecord', () => {
  it('moves from checked in to checked out', () => {
    vi.setSystemTime(new Date('2026-09-13T10:00:00Z'));
    const record = AttendanceRecord.start({
      id: 'attendance-1',
      employeeId: 'employee-1',
      workDate: '2026-09-13',
      type: AttendanceType.Office,
      checkedInAt: new Date('2026-09-13T01:00:00Z'),
    });

    expect(record.status).toBe(AttendanceStatus.CheckedIn);

    record.checkOut(new Date('2026-09-13T09:00:00Z'));

    expect(record.status).toBe(AttendanceStatus.CheckedOut);
  });

  it('rejects checkout before check-in', () => {
    vi.setSystemTime(new Date('2026-09-13T10:00:00Z'));
    const record = AttendanceRecord.start({
      id: 'attendance-1',
      employeeId: 'employee-1',
      workDate: '2026-09-13',
      type: AttendanceType.BusinessTrip,
      checkedInAt: new Date('2026-09-13T02:00:00Z'),
    });

    expect(() => record.checkOut(new Date('2026-09-13T01:59:00Z'))).toThrow(
      'ATTENDANCE_CHECK_OUT_MUST_BE_AFTER_CHECK_IN',
    );
  });
});

