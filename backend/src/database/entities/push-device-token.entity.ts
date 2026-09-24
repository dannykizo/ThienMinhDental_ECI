import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'push_device_tokens' })
export class PushDeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'varchar', length: 200, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: string;

  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', name: 'last_registered_at' })
  lastRegisteredAt!: Date;

  @Column({ type: 'timestamptz', name: 'last_push_at', nullable: true })
  lastPushAt?: Date | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
