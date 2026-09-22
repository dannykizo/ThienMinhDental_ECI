import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';

export interface MonthlyRow {
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
}

@Injectable()
export class ReportingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async dashboard(): Promise<Record<string, number>> {
    const [row] = await this.dataSource.query<Array<Record<string, number>>>(`SELECT
      (SELECT COUNT(*)::int FROM employees WHERE is_active=true) AS "activeEmployees",
      (SELECT COUNT(DISTINCT employee_id)::int FROM attendance_events WHERE (server_time AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date) AS "attendanceToday",
      (SELECT COUNT(*)::int FROM attendance_events WHERE cardinality(risk_flags)>0 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date) AS "reviewRequired",
      (SELECT COUNT(*)::int FROM business_trips WHERE status IN ('ASSIGNED','IN_PROGRESS')) AS "activeTrips",
      (SELECT COUNT(*)::int FROM leave_requests WHERE status='SUBMITTED') AS "pendingLeave",
      (SELECT COUNT(*)::int FROM announcements WHERE status='PUBLISHED') AS "publishedAnnouncements"`);
    return row ?? {};
  }

  async monthly(month: string, employeeId?: string, departmentId?: string): Promise<MonthlyRow[]> {
    this.validateMonth(month);
    return this.dataSource.query<MonthlyRow[]>(`WITH bounds AS (
      SELECT $1::date AS month_start, LEAST(($1::date + INTERVAL '1 month - 1 day')::date, (now() AT TIME ZONE 'Asia/Bangkok')::date) AS month_end
    ), scheduled AS (
      SELECT e.id employee_id, e.employee_code, e.full_name, d.name department_name, day::date work_date
      FROM employees e LEFT JOIN departments d ON d.id=e.department_id
      JOIN employee_schedules es ON es.employee_id=e.id
      JOIN work_schedules ws ON ws.id=es.schedule_id AND ws.is_active=true
      CROSS JOIN bounds b CROSS JOIN LATERAL generate_series(b.month_start,b.month_end,'1 day') day
      WHERE e.is_active=true AND es.effective_from<=day::date AND (es.effective_to IS NULL OR es.effective_to>=day::date) AND extract(isodow from day)::int=ANY(ws.weekdays)
        AND ($2::uuid IS NULL OR e.id=$2::uuid) AND ($3::uuid IS NULL OR e.department_id=$3::uuid)
    ), event_rollup AS (
      SELECT employee_id,(server_time AT TIME ZONE 'Asia/Bangkok')::date work_date,
        MIN(server_time) FILTER (WHERE event_type='CHECK_IN') checked_in_at,
        MAX(server_time) FILTER (WHERE event_type='CHECK_OUT') checked_out_at,
        COALESCE(array_remove(array_agg(DISTINCT flag),NULL),'{}') risk_flags
      FROM attendance_events LEFT JOIN LATERAL unnest(risk_flags) flag ON true
      WHERE (server_time AT TIME ZONE 'Asia/Bangkok')::date >= (SELECT month_start FROM bounds) AND (server_time AT TIME ZONE 'Asia/Bangkok')::date <= (SELECT month_end FROM bounds)
      GROUP BY employee_id,(server_time AT TIME ZONE 'Asia/Bangkok')::date
    ) SELECT s.employee_id AS "employeeId",s.employee_code AS "employeeCode",s.full_name AS "fullName",s.department_name AS "departmentName",s.work_date::text AS "workDate",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='CHECK_IN_TIME' ORDER BY aa.created_at DESC LIMIT 1),er.checked_in_at::text) AS "checkedInAt",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='CHECK_OUT_TIME' ORDER BY aa.created_at DESC LIMIT 1),er.checked_out_at::text) AS "checkedOutAt",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='DAY_STATUS' ORDER BY aa.created_at DESC LIMIT 1),
        CASE WHEN EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=s.employee_id AND l.status='APPROVED' AND s.work_date BETWEEN l.start_date AND l.end_date) THEN 'LEAVE'
        WHEN EXISTS(SELECT 1 FROM business_trip_members btm JOIN business_trips bt ON bt.id=btm.business_trip_id WHERE btm.employee_id=s.employee_id AND bt.status IN ('ASSIGNED','IN_PROGRESS','COMPLETED') AND s.work_date BETWEEN (bt.start_at AT TIME ZONE 'Asia/Bangkok')::date AND (bt.end_at AT TIME ZONE 'Asia/Bangkok')::date) THEN 'BUSINESS_TRIP'
        WHEN er.checked_out_at IS NOT NULL THEN 'PRESENT' WHEN er.checked_in_at IS NOT NULL THEN 'INCOMPLETE' ELSE 'ABSENT' END) AS status,
      COALESCE(er.risk_flags,'{}') AS "riskFlags",(SELECT COUNT(*)::int FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date) AS "adjustmentCount"
      FROM scheduled s LEFT JOIN event_rollup er ON er.employee_id=s.employee_id AND er.work_date=s.work_date ORDER BY s.work_date,s.full_name`, [`${month}-01`, employeeId ?? null, departmentId ?? null]);
  }

  async kpi(month: string): Promise<unknown[]> {
    const rows = await this.monthly(month);
    const byEmployee = new Map<string, { employeeId: string; employeeCode: string; fullName: string; scheduledDays: number; presentDays: number; businessTripDays: number; leaveDays: number; incompleteDays: number; absentDays: number; reviewDays: number }>();
    for (const row of rows) {
      const value = byEmployee.get(row.employeeId) ?? { employeeId: row.employeeId, employeeCode: row.employeeCode, fullName: row.fullName, scheduledDays: 0, presentDays: 0, businessTripDays: 0, leaveDays: 0, incompleteDays: 0, absentDays: 0, reviewDays: 0 };
      value.scheduledDays += 1;
      if (row.status === 'PRESENT') value.presentDays += 1;
      if (row.status === 'BUSINESS_TRIP') value.businessTripDays += 1;
      if (row.status === 'LEAVE') value.leaveDays += 1;
      if (row.status === 'INCOMPLETE') value.incompleteDays += 1;
      if (row.status === 'ABSENT') value.absentDays += 1;
      if (row.riskFlags.length || row.adjustmentCount) value.reviewDays += 1;
      byEmployee.set(row.employeeId, value);
    }
    return [...byEmployee.values()];
  }

  async exportMonthly(month: string, employeeId?: string, departmentId?: string): Promise<Buffer> {
    const rows = await this.monthly(month, employeeId, departmentId);
    const blockers = rows.filter((row) => row.status === 'INCOMPLETE');
    if (blockers.length > 0) {
      throw new ConflictException({ code: 'REPORT_HAS_BLOCKERS', message: `Còn ${blockers.length} ngày thiếu check-out; chưa thể phát hành bảng công cuối.` });
    }
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Thiên Minh Dental Workforce';
    const sheet = workbook.addWorksheet(`Bang cong ${month}`);
    sheet.columns = [
      { header: 'Ngày', key: 'workDate', width: 13 }, { header: 'Mã NV', key: 'employeeCode', width: 14 }, { header: 'Họ tên', key: 'fullName', width: 28 }, { header: 'Phòng ban', key: 'departmentName', width: 22 }, { header: 'Check-in', key: 'checkedInAt', width: 24 }, { header: 'Check-out', key: 'checkedOutAt', width: 24 }, { header: 'Trạng thái', key: 'status', width: 18 }, { header: 'Cảnh báo', key: 'riskFlags', width: 30 }, { header: 'Số điều chỉnh', key: 'adjustmentCount', width: 14 },
    ];
    rows.forEach((row) => sheet.addRow({ ...row, riskFlags: row.riskFlags.join(', ') }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183F35' } };
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private validateMonth(month: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException({ code: 'INVALID_REPORT_MONTH', message: 'Tháng phải có định dạng YYYY-MM.' });
  }
}
