import { describe, expect, it } from 'vitest';
import {
  canTransitionDisciplinaryAction,
  isValidDisciplinaryPeriod,
} from '../src/modules/disciplinary-actions/domain/disciplinary-action-policy.js';

describe('disciplinary action policy', () => {
  it('only allows draft issue and issued revocation', () => {
    expect(canTransitionDisciplinaryAction('DRAFT', 'ISSUED')).toBe(true);
    expect(canTransitionDisciplinaryAction('ISSUED', 'REVOKED')).toBe(true);
    expect(canTransitionDisciplinaryAction('DRAFT', 'REVOKED')).toBe(false);
    expect(canTransitionDisciplinaryAction('REVOKED', 'ISSUED')).toBe(false);
  });

  it('requires a bounded suspension period', () => {
    expect(isValidDisciplinaryPeriod('SUSPENSION', '2026-09-26')).toBe(false);
    expect(
      isValidDisciplinaryPeriod('SUSPENSION', '2026-09-26', '2026-09-25'),
    ).toBe(false);
    expect(
      isValidDisciplinaryPeriod('SUSPENSION', '2026-09-26', '2026-09-30'),
    ).toBe(true);
  });

  it('allows an open-ended warning or disciplinary decision', () => {
    expect(isValidDisciplinaryPeriod('WARNING', '2026-09-26')).toBe(true);
    expect(
      isValidDisciplinaryPeriod('DISCIPLINARY_ACTION', '2026-09-26'),
    ).toBe(true);
  });
});
