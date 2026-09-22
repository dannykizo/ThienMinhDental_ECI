import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DepartmentEntity } from './department.entity.js';
import { PositionEntity } from './position.entity.js';
import { UserEntity } from './user.entity.js';

@Entity({ name: 'employees' })
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, name: 'employee_code', unique: true })
  employeeCode!: string;

  @Column({ type: 'varchar', length: 150, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'employee_type', default: 'OFFICE' })
  employeeType!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  @Column({ type: 'date', name: 'hire_date', nullable: true })
  hireDate?: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId?: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true, unique: true })
  userId?: string | null;

  @ManyToOne(() => DepartmentEntity, (department) => department.employees, {
    nullable: true,
  })
  @JoinColumn({ name: 'department_id' })
  department?: DepartmentEntity | null;

  @ManyToOne(() => PositionEntity, (position) => position.employees, {
    nullable: true,
  })
  @JoinColumn({ name: 'position_id' })
  position?: PositionEntity | null;

  @OneToOne(() => UserEntity, (user) => user.employee, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity | null;
}
