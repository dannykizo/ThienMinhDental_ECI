import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { ExplanationWorkflowService } from '../application/explanation-workflow.service.js';

export interface AttendanceEvidenceUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface StoredAttendanceEvidence {
  reference: string;
}

interface AttendanceEvidenceFile {
  buffer: Buffer;
  contentType: string;
}

const allowedTypes = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class AttendanceEvidenceStorage {
  private readonly root: string;

  constructor(config: ConfigService, @InjectDataSource() private readonly dataSource: DataSource, private readonly workflow: ExplanationWorkflowService) {
    this.root = resolve(
      config.get<string>('EVIDENCE_STORAGE_DIR') ??
        join(process.cwd(), 'storage', 'attendance-evidence'),
    );
  }

  async store(
    user: AuthenticatedUserView,
    evidenceId: string,
    file?: AttendanceEvidenceUpload,
  ): Promise<StoredAttendanceEvidence> {
    if (!user.employeeId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_PROFILE_REQUIRED',
        message: 'Tài khoản chưa liên kết nhân viên.',
      });
    }
    if (!file) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_REQUIRED',
        message: 'Ảnh bằng chứng là bắt buộc.',
      });
    }
    const signature = file.buffer.subarray(0, 12);
    const detectedType = signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
      : signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
    const extension = allowedTypes.get(detectedType);
    if (file.mimetype !== 'application/octet-stream' && file.mimetype !== detectedType) {
      throw new BadRequestException({ code: 'EVIDENCE_FILE_TYPE_NOT_ALLOWED', message: 'Định dạng ảnh không khớp nội dung tệp.' });
    }
    if (!extension) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_TYPE_NOT_ALLOWED',
        message: 'Ảnh bằng chứng phải là JPEG, PNG hoặc WebP.',
      });
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_SIZE_INVALID',
        message: 'Ảnh bằng chứng không được vượt quá 5 MB.',
      });
    }

    await mkdir(this.root, { recursive: true });
    const filename = `${evidenceId}.${extension}`;
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`INSERT INTO attendance_evidence_uploads(evidence_id,filename,uploaded_by) VALUES($1,$2,$3) ON CONFLICT(evidence_id) DO NOTHING`, [evidenceId, filename, user.id]);
      const [owner] = await manager.query<Array<{ filename: string; uploaded_by: string }>>('SELECT filename,uploaded_by FROM attendance_evidence_uploads WHERE evidence_id=$1 FOR UPDATE', [evidenceId]);
      if (owner.uploaded_by !== user.id) throw new BadRequestException({ code: 'EVIDENCE_OWNER_MISMATCH', message: 'Ảnh không thuộc tài khoản này.' });
      const [linked] = await manager.query<Array<{ id: string }>>('SELECT id FROM attendance_explanation_requests WHERE evidence_image_reference=$1 LIMIT 1', [`/api/attendance/evidence/${owner.filename}`]);
      if (linked) {
        const current = await readFile(join(this.root, owner.filename));
        if (owner.filename !== filename || !current.equals(file.buffer)) throw new BadRequestException({ code: 'EVIDENCE_ALREADY_ATTACHED', message: 'Ảnh đã gắn với đơn giải trình không được ghi đè.' });
        return;
      }
      await writeFile(join(this.root, filename), file.buffer);
      await manager.query('UPDATE attendance_evidence_uploads SET filename=$2 WHERE evidence_id=$1', [evidenceId, filename]);
    });
    return { reference: `/api/attendance/evidence/${filename}` };
  }

  async assertOwnedReference(user: AuthenticatedUserView, reference: string): Promise<void> {
    if (!/^\/api\/attendance\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(reference)) throw new BadRequestException({ code: 'INVALID_EVIDENCE_REFERENCE', message: 'Ảnh phải được tải lên hệ thống trước khi gửi đơn.' });
    const [owner] = await this.dataSource.query<Array<{ uploaded_by: string }>>('SELECT uploaded_by FROM attendance_evidence_uploads WHERE filename=$1', [reference.split('/').at(-1)]);
    if (owner?.uploaded_by !== user.id) throw new BadRequestException({ code: 'EVIDENCE_OWNER_MISMATCH', message: 'Không tìm thấy ảnh của tài khoản này.' });
    await this.read(reference.split('/').at(-1)!, user);
  }

  async read(filename: string, user: AuthenticatedUserView): Promise<AttendanceEvidenceFile> {
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.exec(
      filename,
    );
    if (!match) {
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Không tìm thấy ảnh bằng chứng.',
      });
    }
    const [owner] = await this.dataSource.query<Array<{ uploaded_by: string }>>('SELECT uploaded_by FROM attendance_evidence_uploads WHERE filename=$1', [filename]);
    if (!user.roles.includes(RoleCode.Admin) && owner?.uploaded_by !== user.id && !await this.workflow.canReadEvidence(user, filename)) throw new NotFoundException({ code: 'EVIDENCE_FILE_NOT_FOUND', message: 'Không tìm thấy ảnh bằng chứng.' });
    try {
      return {
        buffer: await readFile(join(this.root, filename)),
        contentType:
          match[2].toLowerCase() === 'jpg'
            ? 'image/jpeg'
            : `image/${match[2].toLowerCase()}`,
      };
    } catch {
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Không tìm thấy ảnh bằng chứng.',
      });
    }
  }
}
