export type AnnouncementAudienceType = 'ALL' | 'DEPARTMENT' | 'EMPLOYEE';

export type AnnouncementTargetResult =
  | {
      ok: true;
      departmentId: string | null;
      employeeId: string | null;
    }
  | {
      ok: false;
      code: 'DEPARTMENT_REQUIRED' | 'EMPLOYEE_REQUIRED';
    };

export function resolveAnnouncementTarget(
  audienceType: AnnouncementAudienceType,
  departmentId?: string,
  employeeId?: string,
): AnnouncementTargetResult {
  if (audienceType === 'ALL') {
    return { ok: true, departmentId: null, employeeId: null };
  }
  if (audienceType === 'DEPARTMENT') {
    return departmentId
      ? { ok: true, departmentId, employeeId: null }
      : { ok: false, code: 'DEPARTMENT_REQUIRED' };
  }
  return employeeId
    ? { ok: true, departmentId: null, employeeId }
    : { ok: false, code: 'EMPLOYEE_REQUIRED' };
}
