import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DataSource, Repository } from 'typeorm';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { AttendanceExplanationEntity, type AttendanceAdjustmentEntity, type AttendanceEventEntity } from '../src/database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { RolesGuard } from '../src/modules/auth/presentation/roles.guard.js';
import { AttendanceController } from '../src/modules/attendance/attendance.controller.js';
import type { CreateAttendanceExplanationDto, SubmitEmployeeExplanationDto } from '../src/modules/attendance/attendance.dto.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import type { AttendanceEvidenceStorage } from '../src/modules/attendance/infrastructure/attendance-evidence.storage.js';
import type { ExplanationWorkflowService } from '../src/modules/attendance/application/explanation-workflow.service.js';

const employee: AuthenticatedUserView = { id: 'user-1', employeeId: 'employee-1', email: 'employee@example.test', displayName: 'Development-only', roles: [RoleCode.Employee] };
const input: SubmitEmployeeExplanationDto = { submissionId: '019b8453-5ce6-45bc-9c6c-459c33fd2130', workDate: '2026-10-06', issueType: 'OTHER', responseText: 'Development-only explanation' };

interface TestFixture {
  service: AttendanceService;
  repository: { findOne: Mock; save: Mock<(value: AttendanceExplanationEntity) => Promise<AttendanceExplanationEntity>> };
  query: Mock<(sql: string) => Promise<Array<{ id: string | null } | { status: string }>>>;
  storage: { assertOwnedReference: Mock };
}

function fixture(options: { prior?: AttendanceExplanationEntity; pending?: boolean; locked?: boolean; inactive?: boolean } = {}): TestFixture {
  const saved = new AttendanceExplanationEntity();
  const repository = {
    findOneBy: vi.fn().mockResolvedValue(options.prior ?? null),
    findOne: vi.fn().mockResolvedValueOnce(options.prior ?? null).mockResolvedValue(options.pending ? { id: 'existing' } : null),
    create: vi.fn((value: object) => Object.assign(saved, { id: 'new-explanation' }, value)),
    save: vi.fn((value: AttendanceExplanationEntity) => Promise.resolve(value)),
  };
  const query = vi.fn((sql: string) => {
    if (sql.includes('SELECT id FROM employees')) return Promise.resolve(options.inactive ? [] : [{ id: employee.employeeId }]);
    if (sql.includes('SELECT status FROM attendance_periods')) return Promise.resolve([{ status: options.locked ? 'LOCKED' : 'OPEN' }]);
    return Promise.resolve([]);
  });
  const manager = { query, getRepository: vi.fn(() => repository) };
  const dataSource = { query, transaction: vi.fn((callback: (value: typeof manager) => Promise<unknown>) => callback(manager)) };
  const storage = { assertOwnedReference: vi.fn().mockResolvedValue(undefined) };
  const service = new AttendanceService(
    dataSource as unknown as DataSource,
    {} as Repository<AttendanceEventEntity>,
    {} as Repository<AttendanceAdjustmentEntity>,
    repository as unknown as Repository<AttendanceExplanationEntity>,
    storage as unknown as AttendanceEvidenceStorage,
    { initialize: vi.fn((_manager: unknown, item: AttendanceExplanationEntity) => Promise.resolve(item)), deliver: vi.fn().mockResolvedValue(undefined), process: vi.fn().mockRejectedValue(new ForbiddenException({ code: 'EXPLANATION_STEP_FORBIDDEN' })) } as unknown as ExplanationWorkflowService,
  );
  return { service, repository, query, storage };
}

describe('employee-initiated explanations', () => {
  it('uses the authenticated employee, directly submits and records audit without attendance adjustment', async () => {
    const { service, repository, query } = fixture();
    const result = await service.submitEmployeeExplanation(employee, input);
    expect(result).toMatchObject({ employeeId: employee.employeeId, submittedBy: employee.id, source: 'EMPLOYEE', status: 'SUBMITTED', dueAt: null, requestedBy: null, evidenceImageReference: null });
    expect(repository.save).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql]) => sql.includes("'SUBMIT'"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO attendance_adjustments'))).toBe(false);
  });

  it('requires an active employee belonging to the authenticated user', async () => {
    await expect(fixture().service.submitEmployeeExplanation({ ...employee, employeeId: null }, input)).rejects.toMatchObject({ response: { code: 'EMPLOYEE_PROFILE_REQUIRED' } });
    await expect(fixture({ inactive: true }).service.submitEmployeeExplanation(employee, input)).rejects.toMatchObject({ response: { code: 'EMPLOYEE_NOT_FOUND' } });
  });

  it('rejects invalid date and whitespace content before database writes', async () => {
    const { service, repository } = fixture();
    await expect(service.submitEmployeeExplanation(employee, { ...input, workDate: '2026-02-30' })).rejects.toMatchObject({ response: { code: 'INVALID_EXPLANATION_DATE' } });
    await expect(service.submitEmployeeExplanation(employee, { ...input, responseText: '     ' })).rejects.toMatchObject({ response: { code: 'EXPLANATION_CONTENT_REQUIRED' } });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('blocks locked periods and duplicate open employee/date/issue submissions', async () => {
    await expect(fixture({ locked: true }).service.submitEmployeeExplanation(employee, input)).rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_LOCKED' } });
    await expect(fixture({ pending: true }).service.submitEmployeeExplanation(employee, input)).rejects.toMatchObject({ response: { code: 'EXPLANATION_ALREADY_REQUESTED' } });
  });

  it('replays the same submission without creating or auditing twice, even after period closing', async () => {
    const prior = Object.assign(new AttendanceExplanationEntity(), { ...input, submittedBy: employee.id, evidenceImageReference: null, evidenceCapturedAt: null, evidenceLatitude: null, evidenceLongitude: null });
    const { service, repository, query } = fixture({ prior, locked: true });
    expect(await service.submitEmployeeExplanation(employee, input)).toBe(prior);
    expect(repository.save).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("'SUBMIT'"))).toBe(false);
  });

  it('rejects reuse of a submission ID for changed content', async () => {
    const prior = Object.assign(new AttendanceExplanationEntity(), { ...input, responseText: 'Other content', evidenceImageReference: null });
    await expect(fixture({ prior }).service.submitEmployeeExplanation(employee, input)).rejects.toMatchObject({ response: { code: 'EXPLANATION_SUBMISSION_MISMATCH' } });
  });

  it('accepts an attached image without GPS or capture time but verifies ownership', async () => {
    const { service, storage } = fixture();
    const reference = '/api/attendance/evidence/019b8453-5ce6-45bc-9c6c-459c33fd2130.png';
    const result = await service.submitEmployeeExplanation(employee, { ...input, issueType: 'GPS_RISK', evidenceImageReference: reference });
    expect(storage.assertOwnedReference).toHaveBeenCalledWith(employee, reference);
    expect(result.evidenceCapturedAt).toBeNull();
    expect(result.evidenceLatitude).toBeNull();
  });

  it('propagates evidence ownership failure without persisting the explanation', async () => {
    const { service, storage, repository } = fixture();
    storage.assertOwnedReference.mockRejectedValueOnce(new Error('EVIDENCE_OWNER_MISMATCH'));
    await expect(service.submitEmployeeExplanation(employee, { ...input, evidenceImageReference: '/api/attendance/evidence/019b8453-5ce6-45bc-9c6c-459c33fd2130.png' })).rejects.toThrow('EVIDENCE_OWNER_MISMATCH');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('disables creation of new Admin requests', async () => {
    await expect(fixture().service.createExplanation(employee, {} as CreateAttendanceExplanationDto)).rejects.toMatchObject({ response: { code: 'EMPLOYEE_EXPLANATION_REQUIRED' } });
  });

  it('delegates reviews to scoped workflow authorization instead of employee or Admin override', async () => {
    await expect(fixture().service.reviewExplanation(employee, 'item', { status: 'REJECTED', expectedVersion: 1 })).rejects.toMatchObject({ response: { code: 'EXPLANATION_STEP_FORBIDDEN' } });
  });

  it('rejects legacy responses submitted by another employee', async () => {
    const prior = Object.assign(new AttendanceExplanationEntity(), { id: 'legacy', employeeId: 'another-employee', status: 'REQUESTED' });
    await expect(fixture({ prior }).service.respondToExplanation(employee, prior.id, { responseText: input.responseText })).rejects.toMatchObject({ response: { code: 'EXPLANATION_NOT_FOUND' } });
  });
});

describe('explanation endpoint authorization metadata', () => {
  function context(handler: keyof AttendanceController, user: AuthenticatedUserView): ExecutionContext {
    // Reflector reads the handler function; it is not called unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return { getHandler: () => AttendanceController.prototype[handler], getClass: () => AttendanceController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
  }
  it('keeps route administration Admin-only while processing delegates to current scoped workflow policy', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(context('submitExplanation', employee))).toBe(true);
    expect(guard.canActivate(context('reviewExplanation', employee))).toBe(true);
    expect(guard.canActivate(context('explanations', employee))).toBe(true);
    expect(() => guard.canActivate(context('setRoute', employee))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('reroute', employee))).toThrow(ForbiddenException);
    expect(guard.canActivate(context('setRoute', { ...employee, roles: [RoleCode.Admin] }))).toBe(true);
  });
});
