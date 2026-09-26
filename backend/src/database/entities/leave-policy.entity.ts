import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'leave_policies' })
export class LeavePolicyEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 30, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'boolean', name: 'is_active', default: true }) isActive!: boolean;
  @Column({ type: 'boolean', name: 'balance_tracking_enabled', default: false }) balanceTrackingEnabled!: boolean;
  @Column({ type: 'integer', name: 'annual_entitlement_minutes', default: 0 }) annualEntitlementMinutes!: number;
  @Column({ type: 'integer', name: 'day_minutes', default: 480 }) dayMinutes!: number;
  @Column({ type: 'boolean', name: 'carry_over_enabled', default: false }) carryOverEnabled!: boolean;
  @Column({ type: 'integer', name: 'max_carry_over_minutes', default: 0 }) maxCarryOverMinutes!: number;
  @Column({ type: 'boolean', name: 'allow_half_day', default: false }) allowHalfDay!: boolean;
  @Column({ type: 'boolean', name: 'allow_hourly', default: false }) allowHourly!: boolean;
  @Column({ type: 'boolean', name: 'allow_approved_cancellation', default: false }) allowApprovedCancellation!: boolean;
  @Column({ type: 'integer', name: 'minimum_notice_days', default: 0 }) minimumNoticeDays!: number;
  @Column({ type: 'uuid', name: 'created_by', nullable: true }) createdBy?: string | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'employee_leave_balances' })
export class EmployeeLeaveBalanceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'uuid', name: 'policy_id' }) policyId!: string;
  @Column({ type: 'integer', name: 'balance_year' }) balanceYear!: number;
  @Column({ type: 'integer', name: 'entitlement_minutes' }) entitlementMinutes!: number;
  @Column({ type: 'integer', name: 'carry_over_minutes', default: 0 }) carryOverMinutes!: number;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'leave_balance_adjustments' })
export class LeaveBalanceAdjustmentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'balance_id' }) balanceId!: string;
  @Column({ type: 'integer', name: 'delta_minutes' }) deltaMinutes!: number;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'uuid', name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
}
