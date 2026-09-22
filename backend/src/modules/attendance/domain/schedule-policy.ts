import { AttendanceRiskFlag } from './attendance-risk-flag.js';

export interface SchedulePolicyInput {
  startTime: string;
  endTime: string;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requiredWorkMinutes: number;
}

export interface WorkSummary {
  workedMinutes: number;
  overtimeMinutes: number;
  requiredWorkMinutes: number;
  isFullWorkday: boolean;
}

export function evaluateScheduleRisk(
  eventType: 'CHECK_IN' | 'CHECK_OUT',
  localMinutes: number,
  schedule: SchedulePolicyInput,
): AttendanceRiskFlag[] {
  if (eventType === 'CHECK_IN' && localMinutes > timeToMinutes(schedule.startTime) + schedule.lateToleranceMinutes) {
    return [AttendanceRiskFlag.Late];
  }
  if (eventType === 'CHECK_OUT' && localMinutes < timeToMinutes(schedule.endTime) - schedule.earlyLeaveToleranceMinutes) {
    return [AttendanceRiskFlag.EarlyLeave];
  }
  return [];
}

export function calculateWorkSummary(
  checkedInAt: Date | string | null,
  checkedOutAt: Date | string | null,
  schedule: SchedulePolicyInput | null,
): WorkSummary {
  const requiredWorkMinutes = schedule?.requiredWorkMinutes ?? 480;
  if (!checkedInAt || !checkedOutAt) {
    return { workedMinutes: 0, overtimeMinutes: 0, requiredWorkMinutes, isFullWorkday: false };
  }
  const start = new Date(checkedInAt);
  const end = new Date(checkedOutAt);
  const workedMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
  let overtimeMinutes = 0;
  if (schedule) {
    const checkoutMinutes = localMinutes(end);
    overtimeMinutes = Math.max(0, checkoutMinutes - timeToMinutes(schedule.endTime));
  }
  return { workedMinutes, overtimeMinutes, requiredWorkMinutes, isFullWorkday: workedMinutes >= requiredWorkMinutes };
}

export function localMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
