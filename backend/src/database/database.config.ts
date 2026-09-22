import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DepartmentEntity } from './entities/department.entity.js';
import { EmployeeEntity } from './entities/employee.entity.js';
import { PositionEntity } from './entities/position.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { UserRoleEntity } from './entities/user-role.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { AuthSessionEntity } from './entities/auth-session.entity.js';
import {
  BranchEntity,
  EmployeeOrganizationAssignmentEntity,
  UserBranchScopeEntity,
} from './entities/organization.entity.js';
import {
  AnnouncementEntity,
  AnnouncementRecipientEntity,
  AttendanceAdjustmentEntity,
  AttendanceEventEntity,
  BusinessTripEntity,
  BusinessTripMemberEntity,
  CustomerEntity,
  EmployeeScheduleEntity,
  LeaveRequestEntity,
  OfficeLocationEntity,
  ConfigurationAuditLogEntity,
  DepartmentScheduleEntity,
  WorkScheduleEntity,
} from './entities/workforce.entity.js';

export const databaseEntities = [
  UserEntity,
  AuthSessionEntity,
  EmployeeEntity,
  DepartmentEntity,
  PositionEntity,
  RoleEntity,
  UserRoleEntity,
  BranchEntity,
  EmployeeOrganizationAssignmentEntity,
  UserBranchScopeEntity,
  WorkScheduleEntity,
  EmployeeScheduleEntity,
  DepartmentScheduleEntity,
  OfficeLocationEntity,
  ConfigurationAuditLogEntity,
  CustomerEntity,
  BusinessTripEntity,
  BusinessTripMemberEntity,
  AttendanceEventEntity,
  AttendanceAdjustmentEntity,
  LeaveRequestEntity,
  AnnouncementEntity,
  AnnouncementRecipientEntity,
];

export function createDatabaseOptions(databaseUrl: string): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: databaseEntities,
    synchronize: false,
    logging: false,
  };
}
