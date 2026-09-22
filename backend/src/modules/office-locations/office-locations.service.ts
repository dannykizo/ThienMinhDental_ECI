import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import type { CreateOfficeLocationDto, UpdateOfficeLocationDto } from './office-locations.dto.js';

@Injectable()
export class OfficeLocationsService {
  constructor(@InjectRepository(OfficeLocationEntity) private readonly locations: Repository<OfficeLocationEntity>) {}
  list(): Promise<OfficeLocationEntity[]> { return this.locations.find({ order: { name: 'ASC' } }); }
  create(input: CreateOfficeLocationDto): Promise<OfficeLocationEntity> { return this.locations.save(this.locations.create({ ...input, isActive: true })); }
  async update(id: string, input: UpdateOfficeLocationDto): Promise<OfficeLocationEntity> {
    const location = await this.locations.findOne({ where: { id } });
    if (!location) throw new NotFoundException({ code: 'OFFICE_LOCATION_NOT_FOUND', message: 'Không tìm thấy vị trí văn phòng.' });
    Object.assign(location, input);
    return this.locations.save(location);
  }
}
