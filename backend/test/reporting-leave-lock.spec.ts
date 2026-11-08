import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { ReportingService } from '../src/modules/reporting/reporting.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

describe('PQ5 pending leave remains a period blocker under transaction lock',()=>{
  it('rechecks newly pending OT after preflight and never writes LOCKED',async()=>{
    const query=vi.fn().mockResolvedValue([{count:0}]);
    const transactionQuery=vi.fn((sql:string)=>Promise.resolve(sql.includes('WITH bounds')?[{status:'PRESENT',riskFlags:[],workedMinutes:0,adjustmentCount:0}]:sql.includes('FROM overtime_requests')?[{count:1}]:sql.includes('SELECT id,status')?[{id:'period',status:'OPEN'}]:[{count:0}]));
    const manager={query:transactionQuery};
    const db={query,transaction:(callback:(m:typeof manager)=>Promise<unknown>)=>callback(manager)} as unknown as DataSource;
    const service=new ReportingService(db);
    await expect(service.lockPeriod({id:'admin',employeeId:null,email:'development@example.invalid',displayName:'Development only',roles:[RoleCode.Admin]},'2026-10')).rejects.toMatchObject({response:{code:'ATTENDANCE_PERIOD_HAS_BLOCKERS'}});
    expect(transactionQuery.mock.calls.some(([sql])=>sql.includes("VALUES($1::date,'LOCKED'"))).toBe(false);
    expect(transactionQuery.mock.calls.some(([sql])=>sql.includes('FOR UPDATE'))).toBe(true);
  });
  it('rechecks newly pending leave after preflight and never writes LOCKED',async()=>{
    const query=vi.fn().mockResolvedValue([{count:0}]);
    const transactionQuery=vi.fn((sql:string)=>Promise.resolve(sql.includes('WITH bounds')?[{status:'PRESENT',riskFlags:[],workedMinutes:0,adjustmentCount:0}]:sql.includes('FROM leave_requests')?[{count:1}]:sql.includes('SELECT id,status')?[{id:'period',status:'OPEN'}]:[{count:0}]));
    const manager={query:transactionQuery};
    const db={query,transaction:(callback:(m:typeof manager)=>Promise<unknown>)=>callback(manager)} as unknown as DataSource;
    const service=new ReportingService(db);
    await expect(service.lockPeriod({id:'admin',employeeId:null,email:'development@example.invalid',displayName:'Development only',roles:[RoleCode.Admin]},'2026-10')).rejects.toMatchObject({response:{code:'ATTENDANCE_PERIOD_HAS_BLOCKERS'}});
    expect(transactionQuery.mock.calls.some(([sql])=>sql.includes("VALUES($1::date,'LOCKED'"))).toBe(false);
    expect(transactionQuery.mock.calls.some(([sql])=>sql.includes('FOR UPDATE'))).toBe(true);
  });
});
