import 'reflect-metadata';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { normalizePortraitJpeg } from '../src/modules/employees/domain/employee-portrait.js';
import { EmployeePortraitsService } from '../src/modules/employees/employee-portraits.service.js';
import { EmployeePortraitsController, PortraitVersionDto } from '../src/modules/employees/employee-portraits.controller.js';
import { ROLES_METADATA_KEY } from '../src/modules/auth/presentation/roles.decorator.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { validate } from 'class-validator';

// Structural JPEG fixture, not a real employee photo or a full image-decoder test.
function jpeg(width = 10, height = 10, metadata = false): Buffer {
  const frame = Buffer.from([0xff,0xc0,0,11,8,0,0,0,0,1,1,0x11,0]);
  frame.writeUInt16BE(height,5); frame.writeUInt16BE(width,7);
  return Buffer.concat([Buffer.from([0xff,0xd8]), ...(metadata ? [Buffer.from([0xff,0xe1,0,6,71,80,83,0])] : []), frame, Buffer.from([0xff,0xda,0,8,1,1,0,0,63,0,1,0xff,0xd9])]);
}
const actor: AuthenticatedUserView = { id:'dev-admin', employeeId:null, email:'development@example.invalid', displayName:'Development only', roles:[RoleCode.Admin] };
const version = '12345678-1234-4234-8234-123456789012';
function fixture(currentVersion: string | null = null, employeeExists = true): { query: Mock<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>; service: EmployeePortraitsService } {
  const query = vi.fn((sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => {
    void _params;
    if (sql.startsWith('SELECT e.id AS')) return Promise.resolve(employeeExists ? [{ employeeId:'dev-employee', employeeCode:'DEVELOPMENT', fullName:'Development only', version:currentVersion, updatedAt:null }] : []);
    if (sql.startsWith('SELECT id FROM employees')) return Promise.resolve(employeeExists ? [{ id:'dev-employee' }] : []);
    if (sql.startsWith('SELECT version')) return Promise.resolve(currentVersion ? [{ version:currentVersion }] : []);
    return Promise.resolve([]);
  });
  const manager = { query } as unknown as EntityManager;
  const db = { query, transaction: <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => work(manager) } as unknown as DataSource;
  return { query, service:new EmployeePortraitsService(db) };
}
describe('employee portrait boundary', () => {
  it('accepts bounded JPEG structure and strips APP metadata', () => {
    const original = jpeg(120,160,true), result = normalizePortraitJpeg(original);
    expect(result.equals(jpeg(120,160))).toBe(true);
    expect(result.includes(Buffer.from('GPS'))).toBe(false);
  });
  it.each([Buffer.alloc(0),Buffer.from('<svg/>'),Buffer.from([0xff]),Buffer.alloc(800000),jpeg(1700,100),jpeg(100,0),jpeg().subarray(0,-2)])('rejects invalid, oversized and truncated input', value => expect(() => normalizePortraitJpeg(value)).toThrow());
  it('bounds thumbnails separately', () => { expect(() => normalizePortraitJpeg(jpeg(201,100),true)).toThrow(); expect(normalizePortraitJpeg(jpeg(100,160),true).length).toBeGreaterThan(0); });
  it('rejects metadata hidden after the scan and progressive input', () => {
    const afterScan = Buffer.concat([jpeg().subarray(0,-2),Buffer.from([0xff,0xe1,0,6,71,80,83,0,0xff,0xd9])]);
    expect(() => normalizePortraitJpeg(afterScan)).toThrow();
    const progressive = jpeg(); progressive[3] = 0xc2;
    expect(() => normalizePortraitJpeg(progressive)).toThrow();
  });
  it('guards every portrait route at controller level', () => expect(Reflect.getMetadata(ROLES_METADATA_KEY,EmployeePortraitsController)).toEqual([RoleCode.Admin]));
  it('validates optimistic versions, not arbitrary SQL or URLs', async () => {
    for (const expectedVersion of ['none',version]) expect(await validate(Object.assign(new PortraitVersionDto(),{expectedVersion}))).toHaveLength(0);
    for (const expectedVersion of ['',null,'https://example.invalid/photo','../file','not-a-version']) expect((await validate(Object.assign(new PortraitVersionDto(),{expectedVersion}))).length).toBeGreaterThan(0);
  });
  it('denies non-Admin before persistence', async () => {
    const { service,query } = fixture(), user = {...actor,roles:[RoleCode.Employee]};
    await expect(service.list(user)).rejects.toMatchObject({response:{code:'ADMIN_REQUIRED'}});
    await expect(service.read(user,'dev',false)).rejects.toMatchObject({response:{code:'ADMIN_REQUIRED'}});
    await expect(service.save(user,'dev','none',{})).rejects.toMatchObject({response:{code:'ADMIN_REQUIRED'}});
    await expect(service.remove(user,'dev',version)).rejects.toMatchObject({response:{code:'ADMIN_REQUIRED'}});
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects stale removal without deleting or auditing', async () => {
    const {service,query} = fixture(version);
    await expect(service.remove(actor,'dev-employee','none')).rejects.toMatchObject({response:{code:'PORTRAIT_CHANGED'}});
    expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('INSERT'))).toBe(false);
  });
  it('derives self-service ownership from both authenticated account and employee, including active status', async () => {
    const {service,query} = fixture(), self = {...actor, id:'dev-owner', employeeId:'dev-employee', roles:[RoleCode.Employee]};
    expect(await service.mine(self)).toMatchObject({employeeId:'dev-employee'});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('e.id=$1 AND e.user_id=$2 AND e.is_active'), ['dev-employee','dev-owner']);
    const missing = fixture(null,false);
    await expect(missing.service.mine(self)).rejects.toMatchObject({response:{code:'EMPLOYEE_PROFILE_REQUIRED'}});
    await expect(service.mine({...self,employeeId:null})).rejects.toMatchObject({response:{code:'EMPLOYEE_PROFILE_REQUIRED'}});
  });
  it('rechecks ownership inside the save transaction and writes only the linked employee', async () => {
    const {service,query} = fixture(), self = {...actor,id:'dev-owner',employeeId:'dev-employee',roles:[RoleCode.Employee]}, buffer = jpeg();
    await service.saveMine(self,'none',{portrait:[{buffer,mimetype:'image/jpeg',size:buffer.length}],thumbnail:[{buffer,mimetype:'image/jpeg',size:buffer.length}]});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('AND user_id=$2 AND is_active FOR UPDATE'),['dev-employee','dev-owner']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO employee_portraits'),expect.arrayContaining(['dev-employee','dev-owner']));
  });
  it('rejects upload for a deleted employee', async () => {
    const {service} = fixture(null,false), buffer = jpeg();
    await expect(service.save(actor,'dev-employee','none',{portrait:[{buffer,mimetype:'image/jpeg',size:buffer.length}],thumbnail:[{buffer,mimetype:'image/jpeg',size:buffer.length}]})).rejects.toMatchObject({response:{code:'EMPLOYEE_NOT_FOUND'}});
  });
  it('saves a new version and audits references only, never image bytes', async () => {
    const {service,query} = fixture(), buffer = jpeg(100,100,true);
    const result = await service.save(actor,'dev-employee','none',{portrait:[{buffer,mimetype:'image/jpeg',size:buffer.length}],thumbnail:[{buffer,mimetype:'image/jpeg',size:buffer.length}]});
    expect(result.version).toMatch(/^[0-9a-f-]{36}$/);
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain('configuration_audit_logs');
  });
});
