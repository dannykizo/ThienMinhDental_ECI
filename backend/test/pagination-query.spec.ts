import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EmployeeListQueryDto } from '../src/modules/employees/employees.dto.js';
import { OperationsAuditQueryDto } from '../src/modules/operations/operations.dto.js';

describe('admin pagination queries', () => {
  it('transforms safe employee paging values', async () => {
    const query = plainToInstance(EmployeeListQueryDto, { page: '2', pageSize: '25', search: 'TM' });
    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({ page: 2, pageSize: 25, search: 'TM' });
  });

  it('rejects unbounded audit page sizes', async () => {
    const query = plainToInstance(OperationsAuditQueryDto, { page: '0', pageSize: '500' });
    const errors = await validate(query);
    expect(errors.map((error) => error.property).sort()).toEqual(['page', 'pageSize']);
  });
});
