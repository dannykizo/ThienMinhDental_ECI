'use client';

import { RotateCcw, Search, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface EmployeePickerOption {
  id: string;
  employeeCode: string;
  fullName: string;
  isActive?: boolean;
  organizationAssignments?: Array<{
    departmentId: string;
    departmentName: string;
  }>;
}

export function EmployeePicker({
  employees,
  label = 'Nhân viên',
  name = 'employeeId',
  onChange,
  required = true,
  value,
  className = '',
}: {
  employees: EmployeePickerOption[];
  label?: string;
  name?: string;
  onChange: (employeeId: string) => void;
  required?: boolean;
  value: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const departments = useMemo(() => {
    const entries = new Map<string, string>();
    employees.forEach((employee) => employee.organizationAssignments?.forEach((assignment) => {
      entries.set(assignment.departmentId, assignment.departmentName);
    }));
    return [...entries.entries()].sort((left, right) => left[1].localeCompare(right[1], 'vi'));
  }, [employees]);
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const matchingEmployees = employees.filter((employee) => {
    const matchesDepartment = !departmentId || employee.organizationAssignments?.some((assignment) => assignment.departmentId === departmentId);
    const matchesQuery = !normalizedQuery || `${employee.employeeCode} ${employee.fullName}`.toLocaleLowerCase('vi').includes(normalizedQuery);
    return matchesDepartment && matchesQuery;
  });
  const selected = employees.find((employee) => employee.id === value);
  const options = selected && !matchingEmployees.some((employee) => employee.id === selected.id)
    ? [selected, ...matchingEmployees]
    : matchingEmployees;

  return <div className={`employee-picker ${className}`.trim()}>
    <div className="employee-picker-filters">
      <label className="search-box"><Search aria-hidden="true" size={15} /><input aria-label="Tìm nhân viên" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã hoặc họ tên…" type="search" value={query} /></label>
      {departments.length > 1 && <label className="compact-select">Phòng ban<select aria-label="Lọc nhân viên theo phòng ban" onChange={(event) => {
        const nextDepartmentId = event.target.value;
        setDepartmentId(nextDepartmentId);
        if (value && nextDepartmentId && !selected?.organizationAssignments?.some((assignment) => assignment.departmentId === nextDepartmentId)) onChange('');
      }} value={departmentId}><option value="">Tất cả</option>{departments.map(([id, nameValue]) => <option key={id} value={id}>{nameValue}</option>)}</select></label>}
      {(query || departmentId) && <button aria-label="Xóa bộ lọc nhân viên" className="icon-button employee-picker-reset" onClick={() => { setQuery(''); setDepartmentId(''); }} title="Xóa bộ lọc" type="button"><RotateCcw size={15} /></button>}
    </div>
    <label>{label}<select name={name} onChange={(event) => onChange(event.target.value)} required={required} value={value}><option value="">Chọn nhân viên</option>{options.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
    <small className="employee-picker-count"><UsersRound aria-hidden="true" size={13} /> {matchingEmployees.length}/{employees.length} nhân viên phù hợp</small>
  </div>;
}
