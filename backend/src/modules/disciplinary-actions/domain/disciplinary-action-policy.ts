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
  const validDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION'].includes(actionType) || !validDate(effectiveFrom)) return false;
  if (actionType === 'SUSPENSION' && !effectiveTo) return false;
  if (!effectiveTo) return true;
  return validDate(effectiveTo) && effectiveTo >= effectiveFrom;
}
