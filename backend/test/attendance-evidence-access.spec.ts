import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { AttendanceEvidenceStorage } from '../src/modules/attendance/infrastructure/attendance-evidence.storage.js';
import type { ExplanationWorkflowService } from '../src/modules/attendance/application/explanation-workflow.service.js';

const workflow = { canReadEvidence: vi.fn().mockResolvedValue(false) } as unknown as ExplanationWorkflowService;

const employee: AuthenticatedUserView = { id: 'user-1', employeeId: 'employee-1', email: 'employee@example.test', displayName: 'Development-only', roles: [RoleCode.Employee] };
const filename = '019b8453-5ce6-45bc-9c6c-459c33fd2130.png';

describe('attendance evidence validation and access', () => {
  it('rejects references outside the authenticated internal image endpoint', async () => {
    const query = vi.fn();
    const storage = new AttendanceEvidenceStorage(new ConfigService(), { query } as unknown as DataSource, workflow);
    await expect(storage.assertOwnedReference(employee, 'https://example.test/image.png')).rejects.toMatchObject({ response: { code: 'INVALID_EVIDENCE_REFERENCE' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects attaching or reading another employee image', async () => {
    const query = vi.fn().mockResolvedValue([{ uploaded_by: 'another-user' }]);
    const storage = new AttendanceEvidenceStorage(new ConfigService(), { query } as unknown as DataSource, workflow);
    await expect(storage.assertOwnedReference(employee, `/api/attendance/evidence/${filename}`)).rejects.toMatchObject({ response: { code: 'EVIDENCE_OWNER_MISMATCH' } });
    await expect(storage.read(filename, employee)).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_NOT_FOUND' } });
  });

  it('does not expose unowned legacy/orphan files to employees', async () => {
    const storage = new AttendanceEvidenceStorage(new ConfigService(), { query: vi.fn().mockResolvedValue([]) } as unknown as DataSource, workflow);
    await expect(storage.read(filename, employee)).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_NOT_FOUND' } });
    await expect(storage.read('../secrets.env', employee)).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_NOT_FOUND' } });
  });

  it('rejects a forged image MIME type and oversized content before writes', async () => {
    const storage = new AttendanceEvidenceStorage(new ConfigService(), {} as DataSource, workflow);
    await expect(storage.store(employee, filename.slice(0, 36), { buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/png' })).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_TYPE_NOT_ALLOWED' } });
    await expect(storage.store(employee, filename.slice(0, 36), { buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), size: 5 * 1024 * 1024 + 1, mimetype: 'application/octet-stream' })).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_SIZE_INVALID' } });
  });
});
