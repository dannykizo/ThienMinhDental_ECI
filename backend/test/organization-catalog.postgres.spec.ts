import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { CatalogService, requireActiveCatalogReferences, type CatalogRow } from '../src/modules/organization-access/application/catalog.service.js';
import { OrganizationAccessService } from '../src/modules/organization-access/application/organization-access.service.js';

// Source only until Tech Lead requests execution. No seed/login/email/push.
// All writes/deletions stay in one exact, owned, disposable local database.
describe.skipIf(process.env.CATALOG_POSTGRES_TEST!=='1')('Catalogue lifecycle — isolated PostgreSQL',()=>{
  const name=`catalog_test_${randomUUID().replaceAll('-','')}`;
  let maintenance: DataSource;
  let db: DataSource;
  let created=false;
  let service: CatalogService;
  let organization: OrganizationAccessService;
  let admin: AuthenticatedUserView;

  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV!=='development' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Explicit local development environment required');
    if (!/^catalog_test_[a-f0-9]{32}$/.test(name) || url.pathname===`/${name}`) throw new Error('Unsafe database target');
    maintenance=new DataSource({type:'postgres',url:url.toString()});
    await maintenance.initialize(); await maintenance.query(`CREATE DATABASE "${name}"`); created=true;
    const { applicationDataSource }=await import('../src/database/data-source.js');
    if (applicationDataSource.options.type!=='postgres') throw new Error('Expected PostgreSQL');
    url.pathname=`/${name}`;
    db=new DataSource({...applicationDataSource.options,url:url.toString()});
    await db.initialize(); await db.runMigrations();
    const [user]=await db.query<Array<{id:string}>>(`INSERT INTO users(email,password_hash) VALUES ($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`,[`catalog-${randomUUID()}@development.invalid`]);
    admin={id:user.id,roles:[RoleCode.Admin]} as AuthenticatedUserView;
    service=new CatalogService(db); organization=new OrganizationAccessService(db,service);
  },30_000);

  afterAll(async()=>{
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^catalog_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  });

  async function catalogue(kind:'branches'|'departments'|'positions'): Promise<CatalogRow> {
    return service.create(admin,kind,{code:randomUUID().slice(0,28),name:'Development-only catalogue fixture'});
  }
  async function person(departmentId: string,positionId: string|null=null): Promise<string> {
    const [row]=await db.query<Array<{id:string}>>(`INSERT INTO employees(employee_code,full_name,department_id,position_id)
      VALUES($1,'Development-only catalogue fixture',$2,$3) RETURNING id`,[randomUUID().slice(0,28),departmentId,positionId]);
    return row.id;
  }

  it.each(['branches','departments','positions'] as const)('deletes unused %s and keeps CREATE/DELETE audits',async kind=>{
    const row=await catalogue(kind);
    const impact=await service.impact(admin,kind,row.id);
    expect(impact.canDelete).toBe(true);
    await service.remove(admin,kind,row.id,{reason:'Development-only typo cleanup',confirmationToken:impact.confirmationToken});
    expect(await db.query(`SELECT id FROM ${kind} WHERE id=$1`,[row.id])).toHaveLength(0);
    const [audit]=await db.query<Array<{count:number}>>(`SELECT count(*)::int AS count FROM configuration_audit_logs WHERE resource_id=$1`,[row.id]);
    expect(audit.count).toBe(2);
  });

  it('protects position history against ON DELETE SET NULL',async()=>{
    const department=await catalogue('departments'),position=await catalogue('positions');
    const employeeId=await person(department.id,position.id);
    const preview=await service.impact(admin,'positions',position.id);
    expect(preview.everUsed).toBe(true); expect(preview.canDelete).toBe(false);
    await expect(service.remove(admin,'positions',position.id,{reason:'Development-only deletion attempt',confirmationToken:preview.confirmationToken})).rejects.toMatchObject({status:409});
    await expect(db.query('DELETE FROM positions WHERE id=$1',[position.id])).rejects.toMatchObject({code:'23503'});
    const [row]=await db.query<Array<{position_id:string}>>('SELECT position_id FROM employees WHERE id=$1',[employeeId]);
    expect(row.position_id).toBe(position.id);
  });

  it('remembers branch use even after a mutable account scope is removed',async()=>{
    const branch=await catalogue('branches');
    await db.query('INSERT INTO user_branch_scopes(user_id,branch_id) VALUES($1,$2)',[admin.id,branch.id]);
    await db.query('DELETE FROM user_branch_scopes WHERE user_id=$1 AND branch_id=$2',[admin.id,branch.id]);
    const preview=await service.impact(admin,'branches',branch.id);
    expect(preview.references).toHaveLength(0); expect(preview.canDelete).toBe(false); expect(preview.everUsed).toBe(true);
    await expect(db.query('DELETE FROM branches WHERE id=$1',[branch.id])).rejects.toMatchObject({code:'23503'});
  });

  it('rejects stale preview if new usage appears between preview and confirmation',async()=>{
    const department=await catalogue('departments');
    const preview=await service.impact(admin,'departments',department.id);
    await person(department.id);
    await expect(service.update(admin,'departments',department.id,{name:department.name,isActive:false,reason:'Development-only closure',confirmationToken:preview.confirmationToken})).rejects.toMatchObject({status:409});
    await expect(service.remove(admin,'departments',department.id,{reason:'Development-only delete',confirmationToken:preview.confirmationToken})).rejects.toMatchObject({status:409});
    const [row]=await db.query<Array<{is_active:boolean}>>('SELECT is_active FROM departments WHERE id=$1',[department.id]);
    expect(row.is_active).toBe(true);
  });

  it('archives/restores used department without touching employees or memberships',async()=>{
    const department=await catalogue('departments');
    const employeeId=await person(department.id);
    for (const isActive of [false,true]) {
      const preview=await service.impact(admin,'departments',department.id);
      await service.update(admin,'departments',department.id,{name:department.name,isActive,reason:'Development-only lifecycle',confirmationToken:preview.confirmationToken});
      const [employee]=await db.query<Array<{department_id:string;is_active:boolean}>>('SELECT department_id,is_active FROM employees WHERE id=$1',[employeeId]);
      expect(employee.department_id).toBe(department.id); expect(employee.is_active).toBe(true);
      if (!isActive) await expect(requireActiveCatalogReferences(db.manager,{departments:[department.id]})).rejects.toMatchObject({status:400});
    }
    const [audit]=await db.query<Array<{count:number}>>(`SELECT count(*)::int AS count FROM configuration_audit_logs WHERE resource_id=$1 AND action IN ('DEACTIVATE','REACTIVATE')`,[department.id]);
    expect(audit.count).toBe(2);
  });

  it('allows deletion of unused team but keeps code and department immutable',async()=>{
    const department=await catalogue('departments');
    const team=await organization.createTeam(admin,{departmentId:department.id,code:randomUUID().slice(0,28),name:'Development-only unused team'});
    const preview=await service.impact(admin,'teams',team.id);
    expect(preview.canDelete).toBe(true);
    await expect(service.update(admin,'teams',team.id,{code:'CHANGED',name:team.name,isActive:true,reason:'Development-only code change',confirmationToken:preview.confirmationToken})).rejects.toMatchObject({status:400});
    await service.remove(admin,'teams',team.id,{reason:'Development-only unused team cleanup',confirmationToken:preview.confirmationToken});
    expect(await db.query('SELECT id FROM organization_teams WHERE id=$1',[team.id])).toHaveLength(0);
    // Parent department was used to create a team, even though that team is gone.
    expect((await service.impact(admin,'departments',department.id)).canDelete).toBe(false);
  });

  it('does not reset historical usage when restoring a catalogue',async()=>{
    const department=await catalogue('departments'); await person(department.id);
    for (const isActive of [false,true]) {
      const impact=await service.impact(admin,'departments',department.id);
      await service.update(admin,'departments',department.id,{name:department.name,isActive,reason:'Development-only restore',confirmationToken:impact.confirmationToken});
    }
    expect((await service.impact(admin,'departments',department.id)).canDelete).toBe(false);
  });
});
