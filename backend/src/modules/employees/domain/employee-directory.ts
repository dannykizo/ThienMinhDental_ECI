// Directory consumers receive identity/organization only; detailed profiles remain Admin-only.
export function basicEmployee<T extends { id: string; employeeCode: string; fullName: string; employeeType: string; isActive: boolean; userId?: string | null }>(
  employee: T,
): Pick<T, 'id' | 'employeeCode' | 'fullName' | 'employeeType' | 'isActive'> & { userId: string | null; hasAccount: boolean } {
  return { id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName,
    employeeType: employee.employeeType, isActive: employee.isActive, userId: employee.userId ?? null, hasAccount: Boolean(employee.userId) };
}
