import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { normalizePortraitJpeg } from './domain/employee-portrait.js';

export interface PortraitUpload { buffer: Buffer; mimetype: string; size: number; }
@Injectable()
export class EmployeePortraitsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async list(actor: AuthenticatedUserView): Promise<unknown> {
    this.admin(actor);
    return this.db.query('SELECT employee_id AS "employeeId",version,updated_at AS "updatedAt" FROM employee_portraits');
  }
  async read(actor: AuthenticatedUserView, id: string, thumbnail: boolean): Promise<Buffer> {
    this.admin(actor);
    return this.readBytes(id, thumbnail);
  }
  async mine(actor: AuthenticatedUserView): Promise<{ employeeId: string; employeeCode: string; fullName: string; version: string | null; updatedAt: string | null }> {
    if (!actor.employeeId) throw new ForbiddenException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa có hồ sơ nhân viên.' });
    const [row] = await this.db.query<{ employeeId: string; employeeCode: string; fullName: string; version: string | null; updatedAt: string | null }[]>(`SELECT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",p.version,p.updated_at AS "updatedAt"
      FROM employees e LEFT JOIN employee_portraits p ON p.employee_id=e.id WHERE e.id=$1 AND e.user_id=$2 AND e.is_active`, [actor.employeeId, actor.id]);
    if (!row) throw new ForbiddenException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Không có hồ sơ nhân viên đang hoạt động thuộc tài khoản này.' });
    return row;
  }
  async readMine(actor: AuthenticatedUserView, thumbnail: boolean): Promise<Buffer> {
    const profile = await this.mine(actor);
    return this.readBytes(profile.employeeId, thumbnail);
  }
  async saveMine(actor: AuthenticatedUserView, expectedVersion: string, files: { portrait?: PortraitUpload[]; thumbnail?: PortraitUpload[] }): Promise<{ version: string }> {
    const profile = await this.mine(actor);
    return this.write(actor, profile.employeeId, expectedVersion, files, true);
  }
  private async readBytes(id: string, thumbnail: boolean): Promise<Buffer> {
    const [row] = await this.db.query<{ data: Buffer }[]>(`SELECT ${thumbnail ? 'thumbnail' : 'portrait'} AS data FROM employee_portraits WHERE employee_id=$1`, [id]);
    if (!row) throw new NotFoundException({ code: 'PORTRAIT_NOT_FOUND', message: 'Nhân viên chưa có ảnh hồ sơ.' });
    return row.data;
  }
  async save(actor: AuthenticatedUserView, id: string, expectedVersion: string, files: { portrait?: PortraitUpload[]; thumbnail?: PortraitUpload[] }): Promise<{ version: string }> {
    this.admin(actor);
    return this.write(actor, id, expectedVersion, files, false);
  }
  private async write(actor: AuthenticatedUserView, id: string, expectedVersion: string, files: { portrait?: PortraitUpload[]; thumbnail?: PortraitUpload[] }, own: boolean): Promise<{ version: string }> {
    const portrait = this.image(files.portrait?.[0], false), thumbnail = this.image(files.thumbnail?.[0], true);
    return this.db.transaction(async manager => {
      const oldVersion = await this.lock(manager, id, expectedVersion, own ? actor.id : undefined);
      const version = randomUUID();
      await manager.query(`INSERT INTO employee_portraits(employee_id,version,portrait,thumbnail,updated_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(employee_id) DO UPDATE SET version=EXCLUDED.version,portrait=EXCLUDED.portrait,thumbnail=EXCLUDED.thumbnail,updated_by=EXCLUDED.updated_by,updated_at=now()`, [id, version, portrait, thumbnail, actor.id]);
      await this.audit(manager, actor.id, id, 'PHOTO_UPDATED', oldVersion, version);
      return { version };
    });
  }
  async remove(actor: AuthenticatedUserView, id: string, expectedVersion: string): Promise<void> {
    this.admin(actor);
    await this.db.transaction(async manager => {
      const oldVersion = await this.lock(manager, id, expectedVersion);
      if (!oldVersion) throw new NotFoundException({ code: 'PORTRAIT_NOT_FOUND', message: 'Nhân viên chưa có ảnh hồ sơ.' });
      await manager.query('DELETE FROM employee_portraits WHERE employee_id=$1', [id]);
      await this.audit(manager, actor.id, id, 'PHOTO_REMOVED', oldVersion, null);
    });
  }
  private admin(actor: AuthenticatedUserView): void {
    if (!actor.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Chỉ Admin được xem và quản lý ảnh hồ sơ.' });
  }
  private image(file: PortraitUpload | undefined, thumbnail: boolean): Buffer {
    try {
      if (!file || file.mimetype !== 'image/jpeg' || file.buffer.length !== file.size) throw new Error('PORTRAIT_JPEG_REQUIRED');
      return normalizePortraitJpeg(file.buffer, thumbnail);
    } catch {
      throw new BadRequestException({ code: 'PORTRAIT_INVALID', message: 'Ảnh không hợp lệ. Chọn lại ảnh JPEG, PNG hoặc WebP trên app hoặc Admin để chuẩn hóa trước khi lưu.' });
    }
  }
  private async lock(manager: EntityManager, id: string, expected: string, owner?: string): Promise<string | null> {
    // Serialize against the employee deletion table lock before locking portrait rows.
    await manager.query('LOCK TABLE employees IN ROW EXCLUSIVE MODE');
    const [employee] = await manager.query<{ id: string }[]>(`SELECT id FROM employees WHERE id=$1${owner ? ' AND user_id=$2 AND is_active' : ''} FOR UPDATE`, owner ? [id,owner] : [id]);
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy nhân viên.' });
    const [row] = await manager.query<{ version: string }[]>('SELECT version FROM employee_portraits WHERE employee_id=$1', [id]);
    if ((row?.version ?? 'none') !== expected) throw new ConflictException({ code: 'PORTRAIT_CHANGED', message: 'Ảnh đã được thay đổi ở nơi khác. Tải lại hồ sơ trước khi sửa tiếp.' });
    return row?.version ?? null;
  }
  private async audit(manager: EntityManager, actor: string, id: string, action: string, before: string | null, after: string | null): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by)
      VALUES('EMPLOYEE',$1,$2,$3::jsonb,$4::jsonb,$5)`, [id, action, JSON.stringify({ photoVersion: before }), JSON.stringify({ photoVersion: after }), actor]);
  }
}
