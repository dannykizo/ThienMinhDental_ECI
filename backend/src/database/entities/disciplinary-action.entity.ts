import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'employee_disciplinary_actions' })
export class DisciplinaryActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'varchar', length: 30, name: 'action_type' })
  actionType!: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'text' })
  decision!: string;

  @Column({ type: 'date', name: 'effective_from' })
  effectiveFrom!: string;

  @Column({ type: 'date', name: 'effective_to', nullable: true })
  effectiveTo?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @Column({ type: 'uuid', name: 'issued_by', nullable: true })
  issuedBy?: string | null;

  @Column({ type: 'timestamptz', name: 'issued_at', nullable: true })
  issuedAt?: Date | null;

  @Column({ type: 'uuid', name: 'revoked_by', nullable: true })
  revokedBy?: string | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'text', name: 'revocation_reason', nullable: true })
  revocationReason?: string | null;

  @Column({ type: 'uuid', name: 'announcement_id', nullable: true })
  announcementId?: string | null;

  @Column({ type: 'uuid', name: 'revocation_announcement_id', nullable: true })
  revocationAnnouncementId?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
