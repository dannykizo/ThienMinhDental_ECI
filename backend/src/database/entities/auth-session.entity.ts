import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

export enum AuthClientType {
  Web = 'WEB',
  Mobile = 'MOBILE',
}

export enum LoginAlertStatus {
  Pending = 'PENDING',
  Sent = 'SENT',
  Skipped = 'SKIPPED',
  Failed = 'FAILED',
}

@Entity({ name: 'auth_sessions' })
@Index('idx_auth_sessions_user_signed_in', ['userId', 'signedInAt'])
export class AuthSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'device_id', type: 'varchar', length: 128 })
  deviceId!: string;

  @Column({ name: 'device_name', type: 'varchar', length: 160 })
  deviceName!: string;

  @Column({ name: 'client_type', type: 'varchar', length: 20 })
  clientType!: AuthClientType;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'signed_in_at', type: 'timestamptz' })
  signedInAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt!: Date;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, nullable: true })
  refreshTokenHash!: string | null;

  @Column({ name: 'previous_refresh_token_hash', type: 'varchar', length: 64, nullable: true })
  previousRefreshTokenHash!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoke_reason', type: 'varchar', length: 40, nullable: true })
  revokeReason!: string | null;

  @Column({
    name: 'login_alert_status',
    type: 'varchar',
    length: 20,
    default: LoginAlertStatus.Pending,
  })
  loginAlertStatus!: LoginAlertStatus;

  @Column({ name: 'login_alert_sent_at', type: 'timestamptz', nullable: true })
  loginAlertSentAt!: Date | null;

  @Column({ name: 'login_alert_note', type: 'varchar', length: 200, nullable: true })
  loginAlertNote!: string | null;
}
