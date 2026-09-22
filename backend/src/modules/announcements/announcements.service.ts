import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AnnouncementEntity, AnnouncementRecipientEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type { CreateAnnouncementDto, TransitionAnnouncementDto } from './announcements.dto.js';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AnnouncementEntity) private readonly announcements: Repository<AnnouncementEntity>,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query<unknown[]>(`SELECT a.*, COUNT(ar.employee_id)::int AS "recipientCount", COUNT(ar.read_at)::int AS "readCount" FROM announcements a LEFT JOIN announcement_recipients ar ON ar.announcement_id=a.id GROUP BY a.id ORDER BY a.created_at DESC`);
  }

  mine(user: AuthenticatedUserView): Promise<unknown[]> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.query<unknown[]>(`SELECT a.id,a.title,a.body,a.published_at AS "publishedAt",ar.delivered_at AS "deliveredAt",ar.read_at AS "readAt" FROM announcement_recipients ar JOIN announcements a ON a.id=ar.announcement_id WHERE ar.employee_id=$1 AND a.status='PUBLISHED' ORDER BY a.published_at DESC`, [user.employeeId]);
  }

  async markRead(user: AuthenticatedUserView, announcementId: string): Promise<AnnouncementRecipientEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const repository = this.dataSource.getRepository(AnnouncementRecipientEntity);
    const recipient = await repository.findOne({ where: { announcementId, employeeId: user.employeeId } });
    if (!recipient) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_RECEIVED', message: 'Không tìm thấy thông báo trong danh sách nhận.' });
    if (!recipient.readAt) recipient.readAt = new Date();
    return repository.save(recipient);
  }

  create(user: AuthenticatedUserView, input: CreateAnnouncementDto): Promise<AnnouncementEntity> {
    if (input.audienceType === 'DEPARTMENT' && !input.departmentId) throw new BadRequestException({ code: 'DEPARTMENT_REQUIRED', message: 'Phải chọn phòng ban cho đối tượng nhận theo phòng.' });
    return this.announcements.save(this.announcements.create({ ...input, departmentId: input.departmentId ?? null, status: 'DRAFT', createdBy: user.id }));
  }

  async transition(id: string, input: TransitionAnnouncementDto): Promise<AnnouncementEntity> {
    const announcement = await this.announcements.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
    if (announcement.status !== 'DRAFT') throw new ConflictException({ code: 'ANNOUNCEMENT_NOT_DRAFT', message: 'Chỉ thông báo nháp mới được xuất bản hoặc hủy.' });
    if (input.status === 'CANCELLED') {
      announcement.status = 'CANCELLED';
      return this.announcements.save(announcement);
    }
    return this.dataSource.transaction(async (manager) => {
      const recipientRows = await manager.query<Array<{ id: string }>>(`SELECT id FROM employees WHERE is_active=true AND ($1::varchar='ALL' OR department_id=$2::uuid)`, [announcement.audienceType, announcement.departmentId]);
      const recipients = recipientRows.map(({ id: employeeId }) => manager.getRepository(AnnouncementRecipientEntity).create({ announcementId: announcement.id, employeeId, deliveredAt: new Date() }));
      if (recipients.length) await manager.getRepository(AnnouncementRecipientEntity).save(recipients);
      announcement.status = 'PUBLISHED';
      announcement.publishedAt = new Date();
      return manager.getRepository(AnnouncementEntity).save(announcement);
    });
  }
}
