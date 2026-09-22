import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'work_schedules' })
export class WorkScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'int', array: true }) weekdays!: number[];
  @Column({ type: 'time', name: 'start_time' }) startTime!: string;
  @Column({ type: 'time', name: 'end_time' }) endTime!: string;
  @Column({ type: 'int', name: 'late_tolerance_minutes', default: 3 }) lateToleranceMinutes!: number;
  @Column({ type: 'int', name: 'early_leave_tolerance_minutes', default: 0 }) earlyLeaveToleranceMinutes!: number;
  @Column({ type: 'int', name: 'required_work_minutes', default: 480 }) requiredWorkMinutes!: number;
  @Column({ type: 'boolean', name: 'is_active', default: true }) isActive!: boolean;
}

@Entity({ name: 'employee_schedules' })
export class EmployeeScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'uuid', name: 'schedule_id' }) scheduleId!: string;
  @Column({ type: 'date', name: 'effective_from' }) effectiveFrom!: string;
  @Column({ type: 'date', name: 'effective_to', nullable: true }) effectiveTo?: string | null;
}

@Entity({ name: 'department_schedules' })
export class DepartmentScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'branch_id' }) branchId!: string;
  @Column({ type: 'uuid', name: 'department_id' }) departmentId!: string;
  @Column({ type: 'uuid', name: 'schedule_id' }) scheduleId!: string;
  @Column({ type: 'date', name: 'effective_from' }) effectiveFrom!: string;
  @Column({ type: 'date', name: 'effective_to', nullable: true }) effectiveTo?: string | null;
}

@Entity({ name: 'office_locations' })
export class OfficeLocationEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 300 }) address!: string;
  @Column({ type: 'double precision' }) latitude!: number;
  @Column({ type: 'double precision' }) longitude!: number;
  @Column({ type: 'int', name: 'radius_meters' }) radiusMeters!: number;
  @Column({ type: 'int', name: 'accuracy_threshold_meters', default: 50 }) accuracyThresholdMeters!: number;
  @Column({ type: 'uuid', name: 'branch_id', nullable: true }) branchId!: string | null;
  @Column({ type: 'varchar', length: 30, name: 'location_type', default: 'OFFICE' }) locationType!: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  @Column({ type: 'boolean', name: 'is_active', default: true }) isActive!: boolean;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'customers' })
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 180 }) name!: string;
  @Column({ type: 'varchar', length: 300 }) address!: string;
  @Column({ type: 'varchar', length: 120, name: 'contact_name', nullable: true }) contactName?: string | null;
  @Column({ type: 'varchar', length: 30, name: 'contact_phone', nullable: true }) contactPhone?: string | null;
}

@Entity({ name: 'business_trips' })
export class BusinessTripEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 30, unique: true }) code!: string;
  @Column({ type: 'uuid', name: 'customer_id', nullable: true }) customerId?: string | null;
  @Column({ type: 'varchar', length: 180, name: 'site_name' }) siteName!: string;
  @Column({ type: 'varchar', length: 300, name: 'site_address' }) siteAddress!: string;
  @Column({ type: 'timestamptz', name: 'start_at' }) startAt!: Date;
  @Column({ type: 'timestamptz', name: 'end_at' }) endAt!: Date;
  @Column({ type: 'text' }) content!: string;
  @Column({ type: 'boolean', name: 'requires_photo', default: false }) requiresPhoto!: boolean;
  @Column({ type: 'varchar', length: 30, default: 'DRAFT' }) status!: string;
  @Column({ type: 'uuid', name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'business_trip_members' })
export class BusinessTripMemberEntity {
  @PrimaryColumn({ type: 'uuid', name: 'business_trip_id' }) businessTripId!: string;
  @PrimaryColumn({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'varchar', length: 30, name: 'participation_status', default: 'ASSIGNED' }) participationStatus!: string;
  @Column({ type: 'timestamptz', name: 'started_at', nullable: true }) startedAt?: Date | null;
  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true }) completedAt?: Date | null;
  @Column({ type: 'text', nullable: true }) note?: string | null;
}

@Entity({ name: 'attendance_events' })
export class AttendanceEventEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'varchar', length: 20, name: 'event_type' }) eventType!: string;
  @Column({ type: 'varchar', length: 30, name: 'attendance_type' }) attendanceType!: string;
  @Column({ type: 'timestamptz', name: 'server_time' }) serverTime!: Date;
  @Column({ type: 'timestamptz', name: 'device_time', nullable: true }) deviceTime?: Date | null;
  @Column({ type: 'double precision', nullable: true }) latitude?: number | null;
  @Column({ type: 'double precision', nullable: true }) longitude?: number | null;
  @Column({ type: 'double precision', name: 'accuracy_meters', nullable: true }) accuracyMeters?: number | null;
  @Column({ type: 'text', array: true, name: 'risk_flags', default: '{}' }) riskFlags!: string[];
  @Column({ type: 'uuid', name: 'business_trip_id', nullable: true }) businessTripId?: string | null;
  @Column({ type: 'uuid', name: 'office_location_id', nullable: true }) officeLocationId?: string | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'configuration_audit_logs' })
export class ConfigurationAuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40, name: 'resource_type' }) resourceType!: string;
  @Column({ type: 'uuid', name: 'resource_id' }) resourceId!: string;
  @Column({ type: 'varchar', length: 40 }) action!: string;
  @Column({ type: 'jsonb', name: 'old_value', nullable: true }) oldValue!: unknown;
  @Column({ type: 'jsonb', name: 'new_value', nullable: true }) newValue!: unknown;
  @Column({ type: 'uuid', name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'attendance_adjustments' })
export class AttendanceAdjustmentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'date', name: 'work_date' }) workDate!: string;
  @Column({ type: 'varchar', length: 40, name: 'field_name' }) fieldName!: string;
  @Column({ type: 'jsonb', name: 'old_value', nullable: true }) oldValue?: unknown;
  @Column({ type: 'jsonb', name: 'new_value' }) newValue!: unknown;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'uuid', name: 'adjusted_by' }) adjustedBy!: string;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'leave_requests' })
export class LeaveRequestEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'varchar', length: 30, name: 'leave_type' }) leaveType!: string;
  @Column({ type: 'date', name: 'start_date' }) startDate!: string;
  @Column({ type: 'date', name: 'end_date' }) endDate!: string;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'varchar', length: 30, default: 'SUBMITTED' }) status!: string;
  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true }) reviewedBy?: string | null;
  @Column({ type: 'text', name: 'review_note', nullable: true }) reviewNote?: string | null;
  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true }) reviewedAt?: Date | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'announcements' })
export class AnnouncementEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'varchar', length: 30, default: 'DRAFT' }) status!: string;
  @Column({ type: 'varchar', length: 30, name: 'audience_type', default: 'ALL' }) audienceType!: string;
  @Column({ type: 'uuid', name: 'department_id', nullable: true }) departmentId?: string | null;
  @Column({ type: 'uuid', name: 'created_by' }) createdBy!: string;
  @Column({ type: 'timestamptz', name: 'published_at', nullable: true }) publishedAt?: Date | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'announcement_recipients' })
export class AnnouncementRecipientEntity {
  @PrimaryColumn({ type: 'uuid', name: 'announcement_id' }) announcementId!: string;
  @PrimaryColumn({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true }) deliveredAt?: Date | null;
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true }) readAt?: Date | null;
}
