export function canChangeEmployeeStatus(
  currentIsActive: boolean,
  nextIsActive: boolean,
): boolean {
  return currentIsActive !== nextIsActive;
}

export function isValidLifecycleEffectiveDate(
  effectiveDate: string,
  today: string,
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && effectiveDate <= today;
}

export function hasValidLifecycleReason(reason: string): boolean {
  return reason.trim().length >= 5;
}
