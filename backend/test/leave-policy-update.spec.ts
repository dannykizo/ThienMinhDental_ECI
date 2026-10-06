import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { LeavePolicyEntity } from '../src/database/entities/leave-policy.entity.js';
import { LeaveService } from '../src/modules/leave/leave.service.js';
import type { LeaveWorkflowService } from '../src/modules/leave/application/leave-workflow.service.js';
import { UpdateLeavePolicyDto } from '../src/modules/leave/leave.dto.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

describe('PQ5 partial policy PATCH regression discovered in dev cleanup',()=>{
  it('ignores optional DTO undefined fields and preserves policy rules',async()=>{
    const policy=Object.assign(new LeavePolicyEntity(),{id:'policy',code:'DEV',name:'Development only',isActive:true,balanceTrackingEnabled:true,annualEntitlementMinutes:960,dayMinutes:480,carryOverEnabled:false,maxCarryOverMinutes:0,minimumNoticeDays:0,allowHalfDay:true,allowHourly:true,allowApprovedCancellation:true});
    const repo={findOne:vi.fn().mockResolvedValue(policy),save:vi.fn().mockResolvedValue(policy)};
    const manager={getRepository:():typeof repo=>repo,save:vi.fn().mockResolvedValue({}),create:vi.fn((_entity:unknown,value:object)=>value)};
    const db={transaction:(callback:(m:typeof manager)=>Promise<unknown>)=>callback(manager)} as unknown as DataSource;
    const service=new LeaveService(db,{} as LeaveWorkflowService);
    const dto=Object.assign(new UpdateLeavePolicyDto(),{isActive:false});
    await service.updatePolicy({id:'admin',employeeId:null,email:'development@example.invalid',displayName:'Development only',roles:[RoleCode.Admin]},'policy',dto);
    expect(policy).toMatchObject({isActive:false,annualEntitlementMinutes:960,dayMinutes:480,allowHalfDay:true,allowHourly:true});
  });
});
