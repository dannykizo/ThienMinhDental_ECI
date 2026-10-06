import 'reflect-metadata';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { DataSource } from 'typeorm';
import { ManagedModulesService } from '../src/modules/organization-access/application/managed-modules.service.js';
import type { ReportingService } from '../src/modules/reporting/reporting.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

const user={id:'manager',employeeId:'employee',email:'development@example.invalid',displayName:'Development only',roles:[RoleCode.Employee]};
function fixture(grants:object[]): { service:ManagedModulesService; query:Mock<(sql:string, parameters?:unknown[])=>Promise<object[]>>; reporting:{monthly:Mock} } {
  const query=vi.fn((sql:string, parameters?:unknown[])=>{void parameters;return Promise.resolve(sql.includes('organization_management_grants')?grants:sql.includes('SELECT DISTINCT e.id')?[{id:'allowed'}]:[]);});
  const reporting={monthly:vi.fn().mockResolvedValue([])};
  const db={manager:{query},query} as unknown as DataSource;
  return {service:new ManagedModulesService(db,reporting as unknown as ReportingService),query,reporting};
}
const grant={id:'grant',userId:'manager',roleCode:'TEAM_LEADER',departmentId:'department',teamId:'team',validFrom:new Date('2020-01-01'),validUntil:null,revokedAt:null,createdAt:new Date('2020-01-01'),eligible:true};
describe('PQ5 read-only modules are scoped before query/aggregation',()=>{
  it('does not grant Admin/global roles or missing/expired/revoked scoped grants implicit manager reads',async()=>{
    for(const grants of [[],[{...grant,revokedAt:new Date()}],[{...grant,validUntil:new Date('2021-01-01')}],[{...grant,eligible:false}]]){
      const {service,reporting}=fixture(grants);
      await expect(service.attendance({...user,roles:[RoleCode.Admin]},'2026-10')).rejects.toMatchObject({response:{code:'MANAGEMENT_SCOPE_REQUIRED'}});
      expect(reporting.monthly).not.toHaveBeenCalled();
    }
  });
  it('Leader scope uses only team membership and current organization assignment, no department widening',async()=>{
    const {service,query}=fixture([grant]);
    expect(await service.employeeIds(user)).toEqual(['allowed']);
    expect(query.mock.calls[1]?.[0]).toContain('m.ended_at IS NULL');
    expect(query.mock.calls[1]?.[0]).toContain('a.effective_from');
    expect(query.mock.calls[1]).toEqual([expect.any(String),[[],['team']]]);
  });
  it('Head scope is department-wide while reports restrict employee IDs before totals',async()=>{
    const {service,query,reporting}=fixture([{...grant,roleCode:'DEPARTMENT_HEAD',teamId:null}]);
    await service.reports(user,'2026-10');
    expect(query.mock.calls[1]).toEqual([expect.any(String),[['department'],[]]]);
    expect(reporting.monthly).toHaveBeenCalledWith('2026-10',undefined,undefined,['allowed']);
    expect(query.mock.calls[2]?.[0]).toContain('employee_id=ANY($1::uuid[])');
  });
  it('trip and receipt reads use scoped employees; never select GPS, evidence, private body or outside counts',async()=>{
    const {service,query}=fixture([grant]);await service.trips(user);await service.announcements(user);
    const reads=query.mock.calls.filter(([sql])=>sql.includes('FROM business_trip_members')||sql.includes('FROM announcement_recipients'));
    for(const [sql] of reads){expect(sql).toContain('e.id=ANY($1::uuid[])');expect(sql).not.toMatch(/latitude|longitude|evidence_image_reference|a\.body|push_token/);}
  });
});
