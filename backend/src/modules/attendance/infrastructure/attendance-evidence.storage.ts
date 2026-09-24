import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';

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

  constructor(config: ConfigService) {
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
    const extension = allowedTypes.get(file.mimetype);
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
    await writeFile(join(this.root, filename), file.buffer);
    return { reference: `/api/attendance/evidence/${filename}` };
  }

  async read(filename: string): Promise<AttendanceEvidenceFile> {
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.exec(
      filename,
    );
    if (!match) {
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Không tìm thấy ảnh bằng chứng.',
      });
    }
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
