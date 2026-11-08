import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { LeaveStage } from '../../modules/leave/domain/leave-workflow.js';

@Entity({ name: 'overtime_requests' })
export class OvertimeRequestEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'employee_id' }) employeeId!: string;
  @Column({ type: 'uuid', name: 'submitted_by' }) submittedBy!: string;
  @Column({ type: 'uuid', name: 'submission_id' }) submissionId!: string;
  @Column({ type: 'date', name: 'work_date' }) workDate!: string;
  @Column({ type: 'integer', name: 'requested_minutes' }) requestedMinutes!: number;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'text', name: 'work_content' }) workContent!: string;
  @Column({ type: 'varchar', length: 30, default: 'SUBMITTED' }) status!: string;
  @Column({ type: 'varchar', length: 30, name: 'approval_stage' }) approvalStage!: LeaveStage;
  @Column({ type: 'uuid', name: 'workflow_team_id', nullable: true }) workflowTeamId!: string | null;
  @Column({ type: 'uuid', name: 'leader_user_id', nullable: true }) leaderUserId!: string | null;
  @Column({ type: 'uuid', name: 'head_user_id', nullable: true }) headUserId!: string | null;
  @Column({ type: 'integer', name: 'route_version', default: 0 }) routeVersion!: number;
  @Column({ type: 'uuid', name: 'confirmed_by', nullable: true }) confirmedBy!: string | null;
  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true }) confirmedAt!: Date | null;
  @Column({ type: 'text', name: 'confirmation_note', nullable: true }) confirmationNote!: string | null;
  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true }) reviewedBy!: string | null;
  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true }) reviewedAt!: Date | null;
  @Column({ type: 'text', name: 'review_note', nullable: true }) reviewNote!: string | null;
  @Column({ type: 'varchar', length: 20, name: 'decision_method', nullable: true }) decisionMethod!: 'ROUTED' | 'ADMIN_FALLBACK' | null;
  @Column({ type: 'text', name: 'admin_override_reason', nullable: true }) adminOverrideReason!: string | null;
  @Column({ type: 'timestamptz', name: 'submitted_at' }) submittedAt!: Date;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}
