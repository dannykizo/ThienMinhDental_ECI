export type LeaveReviewStatus = 'APPROVED' | 'REJECTED';

export function isValidLeaveDateRange(startDate: string, endDate: string): boolean {
  const validDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  return validDate(startDate) && validDate(endDate) && endDate >= startDate;
}

export function canReviewLeave(status: string): boolean {
  return status === 'SUBMITTED';
}

export function hasValidLeaveReviewNote(status: LeaveReviewStatus, note?: string): boolean {
  return status !== 'REJECTED' || (note?.trim().length ?? 0) >= 5;
}
