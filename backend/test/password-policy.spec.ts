import { describe, expect, it } from 'vitest';
import { validateStrongPassword } from '../src/modules/auth/domain/password-policy.js';

describe('strong password policy', () => {
  it('accepts a production-safe password shape', () => {
    expect(validateStrongPassword('Demo-Admin#2026')).toBeNull();
  });

  it.each([
    'short',
    'onlylowercase123!',
    'ONLYUPPERCASE123!',
    'NoNumbersHere!',
    'NoSymbolHere123',
  ])('rejects weak password %s', (password) => {
    expect(validateStrongPassword(password)).not.toBeNull();
  });
});
