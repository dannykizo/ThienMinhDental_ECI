import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { validatePassword } from '../src/modules/auth/domain/password-policy.js';
import { LoginDto } from '../src/modules/auth/presentation/login.dto.js';
import { CreateEmployeeDto, OrganizationAssignmentDto } from '../src/modules/employees/employees.dto.js';

describe('internal password length policy', () => {
  it.each(['abcdef', 'ABCDEF', '123456', '@#$%^&', 'mật khẩu', 'Demo-Admin#2026', 'a'.repeat(128)])(
    'accepts sufficient length without composition requirements: %s',
    (password) => {
      expect(validatePassword(password)).toBeNull();
    },
  );

  it.each(['', 'abcde', '12345', 'a'.repeat(129)])('rejects length outside 6–128: %s', (password) => {
    expect(validatePassword(password)).toBe('Mật khẩu phải có 6–128 ký tự.');
  });

  it.each(['abcdef', '123456'])('accepts six-character credentials at both API entry points: %s', async (password) => {
    const login = Object.assign(new LoginDto(), {
      email: 'fixture@example.invalid', password, deviceId: 'fixture-device', deviceName: 'Fixture', clientType: 'WEB',
    });
    const employee = Object.assign(new CreateEmployeeDto(), {
      employeeCode: 'FIXTURE', fullName: 'Fixture', employeeType: 'OFFICE', email: 'fixture@example.invalid',
      temporaryPassword: password, organizationAssignments: [Object.assign(new OrganizationAssignmentDto(), {
        branchId: '11111111-1111-4111-8111-111111111111',
        departmentId: '22222222-2222-4222-8222-222222222222', isPrimary: true,
      })],
    });
    expect(await validate(login)).toEqual([]);
    expect(await validate(employee)).toEqual([]);
  });

  it.each(['12345', 'a'.repeat(129)])('rejects invalid password length in both DTOs: %s', async (password) => {
    const login = Object.assign(new LoginDto(), { password });
    const employee = Object.assign(new CreateEmployeeDto(), { temporaryPassword: password });
    expect((await validate(login)).some(error => error.property === 'password')).toBe(true);
    expect((await validate(employee)).some(error => error.property === 'temporaryPassword')).toBe(true);
  });
});
