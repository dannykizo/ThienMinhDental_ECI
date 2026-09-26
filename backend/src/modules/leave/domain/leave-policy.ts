export type LeaveDurationType = 'FULL_DAY' | 'HALF_DAY' | 'HOURS';

export function isValidLeaveDurationInput(input: {
  allowHalfDay: boolean;
  allowHourly: boolean;
  durationType: LeaveDurationType;
  endDate: string;
  endTime?: string | null;
  halfDayPeriod?: string | null;
  startDate: string;
  startTime?: string | null;
}): boolean {
  if (input.durationType === 'FULL_DAY') return true;
  if (input.startDate !== input.endDate) return false;
  if (input.durationType === 'HALF_DAY') {
    return input.allowHalfDay && ['AM', 'PM'].includes(input.halfDayPeriod ?? '');
  }
  return (
    input.allowHourly &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime ?? '') &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime ?? '') &&
    (input.endTime ?? '') > (input.startTime ?? '')
  );
}

export function minutesBetween(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

export function canCancelLeave(
  status: string,
  allowApprovedCancellation: boolean,
): boolean {
  return status === 'SUBMITTED' || (status === 'APPROVED' && allowApprovedCancellation);
}

export function availableLeaveMinutes(input: {
  adjustments: number;
  approved: number;
  carryOver: number;
  entitlement: number;
  pending: number;
}): number {
  return input.entitlement + input.carryOver + input.adjustments - input.approved - input.pending;
}

export function satisfiesMinimumNotice(
  startDate: string,
  today: string,
  minimumNoticeDays: number,
): boolean {
  const minimum = new Date(`${today}T00:00:00Z`);
  minimum.setUTCDate(minimum.getUTCDate() + minimumNoticeDays);
  return startDate >= minimum.toISOString().slice(0, 10);
}
