import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'branches' })
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ name: 'employee_organization_assignments' })
export class EmployeeOrganizationAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'uuid', name: 'branch_id' })
  branchId!: string;

  @Column({ type: 'uuid', name: 'department_id' })
  departmentId!: string;

  @Column({ type: 'uuid', name: 'position_id', nullable: true })
  positionId?: string | null;

  @Column({ type: 'uuid', name: 'manager_employee_id', nullable: true })
  managerEmployeeId?: string | null;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ type: 'date', name: 'effective_from' })
  effectiveFrom!: string;

  @Column({ type: 'date', name: 'effective_to', nullable: true })
  effectiveTo?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

@Entity({ name: 'user_branch_scopes' })
export class UserBranchScopeEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'branch_id' })
  branchId!: string;
}
