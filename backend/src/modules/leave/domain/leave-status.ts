export type LeaveReviewStatus = 'APPROVED' | 'REJECTED';

export function isValidLeaveDateRange(startDate: string, endDate: string): boolean {
  return endDate >= startDate;
}

export function canReviewLeave(status: string): boolean {
  return status === 'SUBMITTED';
}

export function hasValidLeaveReviewNote(status: LeaveReviewStatus, note?: string): boolean {
  return status !== 'REJECTED' || (note?.trim().length ?? 0) >= 5;
}
