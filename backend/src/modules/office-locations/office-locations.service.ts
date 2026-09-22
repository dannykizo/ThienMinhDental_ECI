import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigurationAuditLogEntity, OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type { CreateOfficeLocationDto, UpdateOfficeLocationDto } from './office-locations.dto.js';

@Injectable()
export class OfficeLocationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OfficeLocationEntity) private readonly locations: Repository<OfficeLocationEntity>,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT l.id, l.name, l.address, l.latitude, l.longitude,
        l.radius_meters AS "radiusMeters", l.accuracy_threshold_meters AS "accuracyThresholdMeters",
        l.branch_id AS "branchId", b.name AS "branchName", l.location_type AS "locationType",
        l.is_active AS "isActive", l.created_at AS "createdAt", l.updated_at AS "updatedAt"
       FROM office_locations l LEFT JOIN branches b ON b.id = l.branch_id ORDER BY l.name`,
    );
  }

  async create(user: AuthenticatedUserView, input: CreateOfficeLocationDto): Promise<OfficeLocationEntity> {
    const locationType = input.locationType ?? 'OFFICE';
    this.validateScope(locationType, input.branchId ?? null);
    return this.dataSource.transaction(async (manager) => {
      const location = await manager.save(OfficeLocationEntity, manager.create(OfficeLocationEntity, {
        ...input,
        locationType,
        branchId: input.branchId ?? null,
        isActive: true,
      }));
      await this.audit(manager, user.id, location.id, 'CREATE', null, location);
      return location;
    });
  }

  async update(user: AuthenticatedUserView, id: string, input: UpdateOfficeLocationDto): Promise<OfficeLocationEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OfficeLocationEntity);
      const location = await repository.findOne({ where: { id } });
      if (!location) throw new NotFoundException({ code: 'OFFICE_LOCATION_NOT_FOUND', message: 'Không tìm thấy vị trí làm việc.' });
      const oldValue = { ...location };
      const locationType = input.locationType ?? location.locationType;
      const branchId = input.branchId === undefined ? location.branchId : input.branchId;
      this.validateScope(locationType, branchId);
      Object.assign(location, input, { locationType, branchId });
      const saved = await repository.save(location);
      await this.audit(manager, user.id, saved.id, 'UPDATE', oldValue, saved);
      return saved;
    });
  }

  history(): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT l.id, l.resource_id AS "resourceId", l.action,
        l.old_value AS "oldValue", l.new_value AS "newValue", l.created_at AS "createdAt",
        COALESCE(e.full_name, u.email) AS "actorName"
       FROM configuration_audit_logs l
       JOIN users u ON u.id = l.created_by
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE l.resource_type = 'OFFICE_LOCATION'
       ORDER BY l.created_at DESC LIMIT 100`,
    );
  }

  private validateScope(locationType: 'OFFICE' | 'EXTERNAL_WORKPLACE', branchId: string | null): void {
    if (locationType === 'OFFICE' && !branchId) {
      throw new BadRequestException({ code: 'OFFICE_BRANCH_REQUIRED', message: 'Vị trí văn phòng phải gắn với một chi nhánh.' });
    }
  }

  private audit(manager: EntityManager, userId: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, {
      resourceType: 'OFFICE_LOCATION',
      resourceId,
      action,
      oldValue,
      newValue,
      createdBy: userId,
    }));
  }
}
