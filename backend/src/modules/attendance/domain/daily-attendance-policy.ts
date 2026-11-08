export interface DailyAttendanceEvent { eventType: string; attendanceType: string }

// One pair per Vietnam calendar day, shared across office and field attendance.
// Legacy events participate in the limit but are never removed/reinterpreted.
export function dailyAttendanceError(events: DailyAttendanceEvent[], eventType: string, attendanceType: string): string | null {
  const checkIn = events.find(event => event.eventType === 'CHECK_IN');
  const checkOut = events.find(event => event.eventType === 'CHECK_OUT');
  if (eventType === 'CHECK_IN') return checkIn || checkOut ? 'DAILY_CHECK_IN_LIMIT' : null;
  if (checkOut) return 'DAILY_CHECK_OUT_LIMIT';
  if (!checkIn) return 'CHECK_IN_REQUIRED';
  if (checkIn.attendanceType !== attendanceType) return 'ATTENDANCE_TYPE_MISMATCH';
  return null;
}

export function vietnamWorkDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
