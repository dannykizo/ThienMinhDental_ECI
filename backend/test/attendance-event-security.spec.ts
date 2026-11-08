import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, type Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceEventEntity } from '../src/database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { RecordAttendanceEventDto } from '../src/modules/attendance/attendance.dto.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { OfficeGeofence } from '../src/modules/attendance/domain/office-geofence.js';

const input = { attendanceType: 'OFFICE', eventType: 'CHECK_IN', latitude: 10, longitude: 106 };

describe('Attendance input and concurrency defenses', () => {
  it.each([undefined, null, '10', NaN, Infinity, 91])('rejects invalid latitude %s', async latitude => {
    const dto = plainToInstance(RecordAttendanceEventDto, { ...input, latitude });
    expect((await validate(dto)).some(error => error.property === 'latitude')).toBe(true);
  });
  it('rejects an employee identity supplied by the client', async () => {
    const dto = plainToInstance(RecordAttendanceEventDto, { ...input, employeeId: 'other-employee' });
    expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).some(error => error.property === 'employeeId')).toBe(true);
  });
  it.each([NaN, Infinity, null])('geofence rejects non-finite coordinates %s', latitude => {
    expect(() => new OfficeGeofence({ latitude: latitude as number, longitude: 106 }, 100)).toThrow();
    const geofence = new OfficeGeofence({ latitude: 10, longitude: 106 }, 100);
    expect(() => geofence.distanceFromCenter({ latitude: latitude as number, longitude: 106 })).toThrow();
  });
  it('serializes office check-and-save; concurrent duplicate check-ins cannot both succeed', async () => {
    const stored: AttendanceEventEntity[] = [];
    const order: string[] = [];
    const repo = { find: vi.fn(() => { order.push('read'); return Promise.resolve([...stored]); }),
      create: (event: object): object => event,
      save: vi.fn((event: AttendanceEventEntity) => { order.push('write'); stored.push(event); return Promise.resolve(event); }) };
    const source = new DataSource({ type: 'postgres' });
    vi.spyOn(source, 'query').mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM office_locations') ? [{ id: 'office', name: 'Development only', latitude: 10, longitude: 106, radiusMeters: 100, accuracyThresholdMeters: 50 }] : []));
    let tail = Promise.resolve();
    vi.spyOn(source, 'transaction').mockImplementation((async (work: (manager: unknown) => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await work({ getRepository: () => repo, query: (sql: string, parameters: unknown[]) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          expect(parameters).toEqual(['attendance-event:fixture-employee']);
          order.push('lock'); return Promise.resolve([]);
        }
        if (sql.includes('INSERT INTO attendance_periods')) return Promise.resolve([]);
        if (sql.includes('SELECT status FROM attendance_periods')) return Promise.resolve([{ status: 'OPEN' }]);
        if (sql.includes('FROM employees e JOIN users')) return Promise.resolve([{ id: 'fixture-employee' }]);
        if (sql.includes('FROM attendance_checkin_captures')) return Promise.resolve([{ id: 'fixture-capture',employee_id:'fixture-employee',user_id:'fixture-user',attendance_type:'OFFICE',latitude:10,longitude:106,accuracy_meters:5,mock_location_signal:false,prepared_at:new Date(),expires_at:new Date(Date.now()+600_000),field_work_content:null }]);
        if (sql.includes('FROM attendance_evidence_uploads')) return Promise.resolve([{ filename: 'fixture-photo.png' }]);
        if (sql.includes('FROM office_locations')) return Promise.resolve([{ id:'office',name:'Development only',latitude:10,longitude:106,radiusMeters:100,accuracyThresholdMeters:50 }]);
        if (sql.includes('WITH org AS')) return Promise.resolve([]);
        throw new Error('Unexpected SQL in attendance fixture');
      } }); } finally { release(); }
    }) as typeof source.transaction);
    const service = new AttendanceService(source, repo as unknown as Repository<AttendanceEventEntity>, undefined as never, undefined as never, { assertOwnedReference:vi.fn().mockResolvedValue(undefined) } as never, undefined as never, { session:vi.fn().mockResolvedValue({}),consume:vi.fn().mockResolvedValue(undefined) } as never);
    const user = { id: 'fixture-user', employeeId: 'fixture-employee' } as AuthenticatedUserView;
    const dto = plainToInstance(RecordAttendanceEventDto, { ...input, checkinCaptureId:'fixture-capture', deviceTime: '2000-01-01T00:00:00Z' });
    const results = await Promise.allSettled([service.record(user, dto, 'fixture-session'), service.record(user, dto, 'fixture-session')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(stored).toHaveLength(1);
    expect(stored[0].employeeId).toBe(user.employeeId);
    expect(stored[0].serverTime.getUTCFullYear()).not.toBe(2000);
    expect(order).toEqual(['lock', 'read', 'write', 'lock', 'read']);
    await expect(service.record(user, plainToInstance(RecordAttendanceEventDto, { ...input, latitude: null }), 'fixture-session')).rejects.toBeInstanceOf(BadRequestException);
    expect(stored).toHaveLength(1);
  });
});
