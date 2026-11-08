export interface MonthlyRow {
  attendanceType?: string | null;
  departmentId?: string | null;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
  workDate: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  status: string;
  riskFlags: string[];
  adjustmentCount: number;
  workedMinutes: number;
  requiredWorkMinutes: number;
  overtimeMinutes: number;
  isFullWorkday: boolean;
}

export interface PeriodBlockers {
  openExplanationCount: number;
  pendingLeaveCount: number;
  pendingOvertimeCount: number;
}

export interface MonthlySummary extends PeriodBlockers {
  scheduledDays: number;
  employeeCount: number;
  presentDays: number;
  businessTripDays: number;
  leaveDays: number;
  partialLeaveDays: number;
  incompleteDays: number;
  absentDays: number;
  reviewDays: number;
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  fullWorkdays: number;
  officeDays: number;
  fieldDays: number;
  incompleteBlockerCount: number;
  blockerCount: number;
}

export interface EmployeeMonthlySummary extends MonthlySummary {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

// KPI and scoped reporting reuse the report's day categories and minute totals.
// There is no independent score/payroll formula in these views.
export function summarizeEmployees(rows: MonthlyRow[]): EmployeeMonthlySummary[] {
  const groups = new Map<string, MonthlyRow[]>();
  for (const row of rows) {
    const group = groups.get(row.employeeId) ?? [];
    group.push(row); groups.set(row.employeeId, group);
  }
  return [...groups.values()].map(group => ({
    employeeId: group[0].employeeId, employeeCode: group[0].employeeCode, fullName: group[0].fullName,
    ...summarizeMonthly(group, { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 }, group.filter(row => row.status === 'INCOMPLETE').length),
  }));
}

export function summarizeMonthly(rows: MonthlyRow[], blockers: PeriodBlockers, incompleteBlockerCount: number): MonthlySummary {
  return {
    scheduledDays: rows.length,
    employeeCount: new Set(rows.map(row => row.employeeId)).size,
    presentDays: rows.filter(row => row.status === 'PRESENT').length,
    businessTripDays: rows.filter(row => row.status === 'BUSINESS_TRIP').length,
    leaveDays: rows.filter(row => row.status === 'LEAVE').length,
    partialLeaveDays: rows.filter(row => row.status === 'PARTIAL_LEAVE').length,
    incompleteDays: rows.filter(row => row.status === 'INCOMPLETE').length,
    absentDays: rows.filter(row => row.status === 'ABSENT').length,
    reviewDays: rows.filter(row => row.riskFlags.length > 0 || row.adjustmentCount > 0).length,
    fullWorkdays: rows.filter(row => row.isFullWorkday).length,
    officeDays: rows.filter(row => row.attendanceType === 'OFFICE' && row.checkedInAt && row.checkedOutAt).length,
    fieldDays: rows.filter(row => row.attendanceType === 'BUSINESS_TRIP' && row.checkedInAt && row.checkedOutAt).length,
    totalWorkedMinutes: rows.reduce((sum, row) => sum + row.workedMinutes, 0),
    totalOvertimeMinutes: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
    ...blockers,
    incompleteBlockerCount,
    blockerCount: blockers.openExplanationCount + blockers.pendingLeaveCount + blockers.pendingOvertimeCount + incompleteBlockerCount,
  };
}
