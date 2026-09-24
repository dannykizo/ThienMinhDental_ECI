import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HealthResponse {
  status: 'ok';
  service: 'thien-minh-dental-backend';
}

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'thien-minh-dental-backend',
    };
  }

  @Get('live')
  getLiveness(): HealthResponse {
    return this.getHealth();
  }

  @Get('ready')
  async getReadiness(): Promise<HealthResponse> {
    try {
      await this.dataSource.query('SELECT 1');
      return this.getHealth();
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'thien-minh-dental-backend',
      });
    }
  }
}
