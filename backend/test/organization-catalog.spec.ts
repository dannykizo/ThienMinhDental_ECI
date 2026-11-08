import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { RolesGuard } from '../src/modules/auth/presentation/roles.guard.js';
import { CatalogService, requireActiveCatalogReferences } from '../src/modules/organization-access/application/catalog.service.js';
import { canDeleteCatalog, isCatalogKind } from '../src/modules/organization-access/domain/catalog-lifecycle.js';
import { CatalogController } from '../src/modules/organization-access/presentation/catalog.controller.js';
import { OrganizationCatalogLifecycle1792195200000 } from '../src/database/migrations/1792195200000-organization-catalog-lifecycle.js';

const admin = { id: 'dev-admin',roles: [RoleCode.Admin] } as AuthenticatedUserView;
const employee = { id: 'dev-employee',roles: [RoleCode.Employee] } as AuthenticatedUserView;
type TransactionCallback = (manager: EntityManager)=>Promise<unknown>;
interface Fixture {
  service: CatalogService;
  query: Mock<(sql: string,args?: unknown[])=>Promise<unknown>>;
  transaction: Mock<(first: TransactionCallback|string,second?: TransactionCallback)=>Promise<unknown>>;
}
function fixture(everUsed=false, references=0): Fixture {
  let item = { id: 'dev-catalog',code: 'DEV',name: 'Development only',isActive: true };
  const query = vi.fn((sql: string, args: unknown[]=[]): Promise<unknown> => {
    if (sql.startsWith('SELECT id,code,name')) return Promise.resolve([{ ...item }]);
    if (sql.includes('source.relname')) return Promise.resolve([{ source: 'employees',column: 'department_id' }]);
    if (sql.includes('md5(string_agg')) return Promise.resolve([{ count: references,hash: references ? 'dev-hash' : null }]);
    if (sql.includes('SELECT EXISTS')) return Promise.resolve([{ used: everUsed }]);
    if (sql.includes(' AS teams,')) return Promise.resolve([{ teams: 0,grants: 0,pendingExplanations: 0,pendingLeave: 0 }]);
    if (sql.includes(' AS employees')) return Promise.resolve([{ employees: 0 }]);
    if (sql.startsWith('UPDATE departments')) item={ ...item,code: args[1] as string,name: args[2] as string,isActive: args[3] as boolean };
    return Promise.resolve([]);
  });
  const manager = { query } as unknown as EntityManager;
  const transaction = vi.fn((first: TransactionCallback|string, second?: TransactionCallback): Promise<unknown> => {
    const callback=typeof first==='function' ? first : second;
    if (!callback) return Promise.reject(new Error('Missing development transaction callback'));
    return callback(manager);
  });
  const db={ query,transaction } as unknown as DataSource;
  return { service: new CatalogService(db),query,transaction };
}

describe('Organization catalogue lifecycle', () => {
  it('only deletes never-used, unreferenced records', () => {
    expect(canDeleteCatalog(false,0)).toBe(true);
    expect(canDeleteCatalog(true,0)).toBe(false);
    expect(canDeleteCatalog(false,1)).toBe(false);
    expect(canDeleteCatalog(true,1)).toBe(false);
    expect(isCatalogKind('departments')).toBe(true);
    expect(isCatalogKind('departments; DROP TABLE users')).toBe(false);
    expect(isCatalogKind('__proto__')).toBe(false);
  });

  it.each(['list','create','impact','update','remove'] as const)('keeps %s ADMIN-only at the guard', method => {
    const handler=Object.getOwnPropertyDescriptor(CatalogController.prototype,method)!.value as object;
    const context=(roles: RoleCode[]): ExecutionContext => ({ getHandler: ()=>handler,getClass: ()=>CatalogController,
      switchToHttp: ()=>({ getRequest: ()=>({ user: { roles } }) }) }) as unknown as ExecutionContext;
    const guard=new RolesGuard(new Reflector());
    expect(guard.canActivate(context([RoleCode.Admin]))).toBe(true);
    expect(()=>guard.canActivate(context([RoleCode.Employee]))).toThrow(ForbiddenException);
    expect(()=>guard.canActivate(context([RoleCode.Manager]))).toThrow(ForbiddenException);
  });

  it('denies service writes before touching persistence', async () => {
    const { service,transaction }=fixture();
    const input={ reason: 'Development only',confirmationToken: '0'.repeat(64),name: 'DEV',isActive: false };
    await expect(service.create(employee,'departments',{ code: 'DEV',name: 'DEV' })).rejects.toMatchObject({ status: 403 });
    await expect(service.update(employee,'departments','dev',input)).rejects.toMatchObject({ status: 403 });
    await expect(service.remove(employee,'departments','dev',input)).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized catalogue without interpolating its name', async () => {
    const { service,transaction }=fixture();
    await expect(service.create(admin,'users',{ code: 'DEV',name: 'DEV' })).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([[true,0],[false,1]])('rejects historical/current usage without DELETE', async (used,count) => {
    const { service,query }=fixture(used,count);
    const impact=await service.impact(admin,'departments','dev-catalog');
    expect(impact.canDelete).toBe(false);
    await expect(service.remove(admin,'departments','dev-catalog',{ reason: 'Development only',confirmationToken: impact.confirmationToken })).rejects.toMatchObject({ status: 409 });
    expect(query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });

  it('rejects codes that exceed the column limit after uppercase normalization', async () => {
    const { service,query }=fixture();
    await expect(service.create(admin,'departments',{ code: 'ß'.repeat(30),name: 'Development only' })).rejects.toMatchObject({ status: 400 });
    expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  });

  it('deletes only the exact unused record and retains an audit in the transaction', async () => {
    const { service,query }=fixture();
    const impact=await service.impact(admin,'departments','dev-catalog');
    await service.remove(admin,'departments','dev-catalog',{ reason: 'Development only typo',confirmationToken: impact.confirmationToken });
    expect(query).toHaveBeenCalledWith('DELETE FROM departments WHERE id=$1',['dev-catalog']);
    expect(query.mock.calls.some(([sql,args])=>sql.includes('INSERT INTO configuration_audit_logs') && args?.[2]==='DELETE')).toBe(true);
  });

  it('rejects stale confirmation and whitespace reasons without mutation', async () => {
    const { service,query }=fixture();
    await expect(service.update(admin,'departments','dev-catalog',{ name: 'DEV',isActive: false,reason: 'Development only',confirmationToken: '0'.repeat(64) })).rejects.toMatchObject({ status: 409 });
    await expect(service.remove(admin,'departments','dev-catalog',{ reason: '     ',confirmationToken: '0'.repeat(64) })).rejects.toMatchObject({ status: 400 });
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE') || sql.startsWith('DELETE'))).toBe(false);
  });

  it('archives used data with audit, without deleting references or rerouting requests', async () => {
    const { service,query }=fixture(true,2);
    const impact=await service.impact(admin,'departments','dev-catalog');
    await service.update(admin,'departments','dev-catalog',{ name: 'Development archived',isActive: false,reason: 'Development only closure',confirmationToken: impact.confirmationToken });
    expect(query.mock.calls.some(([sql,args])=>sql.includes('INSERT INTO configuration_audit_logs') && args?.[2]==='DEACTIVATE')).toBe(true);
    expect(query.mock.calls.filter(([sql])=>sql.startsWith('UPDATE')).map(([sql])=>sql)).toEqual(['UPDATE departments SET code=$2,name=$3,is_active=$4 WHERE id=$1']);
    expect(query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });

  it('blocks new references to inactive catalogues', async () => {
    const query=vi.fn<(sql: string)=>Promise<unknown>>().mockResolvedValue([]);
    await expect(requireActiveCatalogReferences({ query } as unknown as EntityManager,{ branches: ['dev'] })).rejects.toMatchObject({ status: 400 });
    expect(query.mock.calls[0][0]).toContain('AND is_active');
    expect(query.mock.calls[0][0]).toContain('FOR SHARE');
  });

  it('installs permanent usage protection and does not auto-remove it in rollback', async () => {
    const query=vi.fn<(sql: string)=>Promise<unknown>>().mockResolvedValue([]);
    const migration=new OrganizationCatalogLifecycle1792195200000();
    await migration.up({ query } as unknown as QueryRunner);
    const sql=query.mock.calls.map(([value])=>value).join('\n');
    expect(sql).toContain('cardinality(c.conkey)=1');
    expect(sql).toContain('AFTER INSERT OR UPDATE OF');
    expect(sql).toContain('BEFORE DELETE');
    expect(sql).toContain('a.old_value');
    await expect(migration.down()).rejects.toThrow('automatic rollback');
  });
});
