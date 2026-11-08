import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { ReportingService } from '../../reporting/reporting.service.js';
import { grantStatus } from '../domain/management-access.js';
import { readManagementGrants } from '../infrastructure/management-grant.reader.js';
import { summarizeEmployees } from '../../reporting/domain/monthly-report.js';

// Dedicated read-only endpoints: scoped grants never unlock global module APIs.
@Injectable()
export class ManagedModulesService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly reporting: ReportingService) {}

  async employeeIds(user: AuthenticatedUserView, reader: Pick<EntityManager, 'query'> = this.db.manager): Promise<string[]> {
    const grants=(await readManagementGrants(reader,user.id)).filter(g=>grantStatus(g,new Date())==='ACTIVE');
    if (!grants.length) throw new ForbiddenException({code:'MANAGEMENT_SCOPE_REQUIRED',message:'Không còn quyền quản lý hiện hành. Hãy tải lại quyền.'});
    const departments=grants.filter(g=>g.roleCode==='DEPARTMENT_HEAD').map(g=>g.departmentId);
    const teams=grants.filter(g=>g.roleCode==='TEAM_LEADER').map(g=>g.teamId!);
    const rows=await reader.query<Array<{id:string}>>(`SELECT DISTINCT e.id FROM employees e JOIN users u ON u.id=e.user_id
      JOIN employee_organization_assignments a ON a.employee_id=e.id JOIN departments d ON d.id=a.department_id JOIN branches b ON b.id=a.branch_id
      WHERE e.is_active AND u.is_active AND d.is_active AND b.is_active
      AND a.effective_from<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND (a.effective_to IS NULL OR a.effective_to>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      AND (a.department_id=ANY($1::uuid[]) OR EXISTS(SELECT 1 FROM organization_team_memberships m JOIN organization_teams t ON t.id=m.team_id
        WHERE m.employee_id=e.id AND m.ended_at IS NULL AND t.is_active AND t.department_id=a.department_id AND t.id=ANY($2::uuid[])))`,[departments,teams]);
    return rows.map(r=>r.id);
  }
  private month(value?: string): string {
    const month=value ?? new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7);
    if (!/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException({code:'INVALID_REPORT_MONTH',message:'Tháng phải có dạng YYYY-MM, trong khoảng 2000–2200.'});
    return month;
  }
  async attendance(user: AuthenticatedUserView, value?: string): Promise<unknown[]> {
    const month=this.month(value);
    return this.db.transaction('REPEATABLE READ', async manager => {
      const ids=await this.employeeIds(user,manager);
      const report=await this.reporting.document(month,undefined,undefined,undefined,ids,manager);
      return report.rows.map(row=>({employeeId:row.employeeId,employeeCode:row.employeeCode,fullName:row.fullName,departmentName:null,
        workDate:row.workDate,checkedInAt:row.checkedInAt,checkedOutAt:row.checkedOutAt,attendanceType:row.attendanceType,
        status:row.status,riskFlags:row.riskFlags,adjustmentCount:row.adjustmentCount,workedMinutes:row.workedMinutes,
        requiredWorkMinutes:row.requiredWorkMinutes,overtimeMinutes:row.overtimeMinutes,isFullWorkday:row.isFullWorkday}));
    });
  }
  async reports(user: AuthenticatedUserView, value?: string): Promise<unknown> {
    const month=this.month(value);
    return this.db.transaction('REPEATABLE READ', async manager => {
      const ids=await this.employeeIds(user,manager);
      const report=await this.reporting.document(month,undefined,undefined,undefined,ids,manager);
      const employees=summarizeEmployees(report.rows).map(row=>({...row,workedMinutes:row.totalWorkedMinutes,overtimeMinutes:row.totalOvertimeMinutes}));
      return {month,employees,summary:report.summary,source:report.source,revision:report.revision,warnings:report.warnings,readOnly:true};
    });
  }
  async trips(user: AuthenticatedUserView): Promise<unknown[]> {
    const ids=await this.employeeIds(user);
    return this.db.query(`SELECT bt.id,bt.code,bt.site_name AS "siteName",bt.start_at AS "startAt",bt.end_at AS "endAt",bt.status,
      e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",m.participation_status AS "participationStatus",m.started_at AS "startedAt",m.completed_at AS "completedAt",
      (bt.responsible_employee_id=e.id) AS "isResponsible"
      FROM business_trip_members m JOIN business_trips bt ON bt.id=m.business_trip_id JOIN employees e ON e.id=m.employee_id
      WHERE e.id=ANY($1::uuid[]) ORDER BY bt.start_at DESC,bt.code,e.full_name`,[ids]);
  }
  async announcements(user: AuthenticatedUserView): Promise<unknown[]> {
    const ids=await this.employeeIds(user);
    return this.db.query(`SELECT a.id,a.title,a.status,a.audience_type AS "audienceType",a.requires_acknowledgement AS "requiresAcknowledgement",a.published_at AS "publishedAt",
      e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",r.delivered_at AS "deliveredAt",r.read_at AS "readAt",r.acknowledged_at AS "acknowledgedAt"
      FROM announcement_recipients r JOIN announcements a ON a.id=r.announcement_id JOIN employees e ON e.id=r.employee_id
      WHERE e.id=ANY($1::uuid[]) AND a.status IN ('PUBLISHED','WITHDRAWN')
      AND NOT EXISTS(SELECT 1 FROM employee_disciplinary_actions da WHERE da.announcement_id=a.id OR da.revocation_announcement_id=a.id)
      ORDER BY a.published_at DESC,e.full_name`,[ids]);
  }
}
