export type DisciplinaryActionType =
  | 'WARNING'
  | 'SUSPENSION'
  | 'DISCIPLINARY_ACTION';
export type DisciplinaryActionStatus = 'DRAFT' | 'ISSUED' | 'REVOKED';

export function canTransitionDisciplinaryAction(
  from: string,
  to: DisciplinaryActionStatus,
): boolean {
  return (
    (from === 'DRAFT' && to === 'ISSUED') ||
    (from === 'ISSUED' && to === 'REVOKED')
  );
}

export function isValidDisciplinaryPeriod(
  actionType: DisciplinaryActionType,
  effectiveFrom: string,
  effectiveTo?: string | null,
): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(effectiveFrom)) return false;
  if (actionType === 'SUSPENSION' && !effectiveTo) return false;
  if (!effectiveTo) return true;
  return datePattern.test(effectiveTo) && effectiveTo >= effectiveFrom;
}
