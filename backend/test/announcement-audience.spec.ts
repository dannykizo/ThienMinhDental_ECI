import { describe, expect, it } from 'vitest';
import { resolveAnnouncementTarget } from '../src/modules/announcements/domain/announcement-audience.js';

describe('announcement audience policy', () => {
  it('targets the whole company without a department or employee', () => {
    expect(resolveAnnouncementTarget('ALL', 'ignored', 'ignored')).toEqual({
      ok: true,
      departmentId: null,
      employeeId: null,
    });
  });

  it('requires the selected target for department and employee audiences', () => {
    expect(resolveAnnouncementTarget('DEPARTMENT')).toEqual({
      ok: false,
      code: 'DEPARTMENT_REQUIRED',
    });
    expect(resolveAnnouncementTarget('EMPLOYEE')).toEqual({
      ok: false,
      code: 'EMPLOYEE_REQUIRED',
    });
  });

  it('clears the target that does not belong to the selected audience', () => {
    expect(resolveAnnouncementTarget('DEPARTMENT', 'department-id', 'employee-id')).toEqual({
      ok: true,
      departmentId: 'department-id',
      employeeId: null,
    });
    expect(resolveAnnouncementTarget('EMPLOYEE', 'department-id', 'employee-id')).toEqual({
      ok: true,
      departmentId: null,
      employeeId: 'employee-id',
    });
  });
});
