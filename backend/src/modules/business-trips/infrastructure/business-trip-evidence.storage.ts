import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';

export interface BusinessTripEvidenceUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface StoredBusinessTripEvidence {
  reference: string;
}

interface BusinessTripEvidenceFile {
  buffer: Buffer;
  contentType: string;
}

const allowedTypes = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class BusinessTripEvidenceStorage {
  private readonly root: string;

  constructor(config: ConfigService, @InjectDataSource() private readonly dataSource: DataSource) {
    this.root = resolve(
      config.get<string>('BUSINESS_TRIP_EVIDENCE_STORAGE_DIR') ??
        join(process.cwd(), 'storage', 'business-trip-evidence'),
    );
  }

  async store(
    user: AuthenticatedUserView,
    evidenceId: string,
    file?: BusinessTripEvidenceUpload,
  ): Promise<StoredBusinessTripEvidence> {
    if (!user.employeeId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_PROFILE_REQUIRED',
        message: 'Tài khoản chưa liên kết nhân viên.',
      });
    }
    if (!file) {
      throw new BadRequestException({
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_REQUIRED',
        message: 'Ảnh hiện trường là bắt buộc.',
      });
    }
    const signature = file.buffer.subarray(0, 12);
    const detectedType = signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
      : signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
    const extension = allowedTypes.get(detectedType);
    if (file.mimetype !== 'application/octet-stream' && file.mimetype !== detectedType) {
      throw new BadRequestException({ code: 'BUSINESS_TRIP_EVIDENCE_FILE_TYPE_NOT_ALLOWED', message: 'Định dạng ảnh không khớp nội dung tệp.' });
    }
    if (!extension) {
      throw new BadRequestException({
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_TYPE_NOT_ALLOWED',
        message: 'Ảnh hiện trường phải là JPEG, PNG hoặc WebP.',
      });
    }
    if (file.size !== file.buffer.length || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new BadRequestException({
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_SIZE_INVALID',
        message: 'Ảnh hiện trường không được vượt quá 5 MB.',
      });
    }

    await mkdir(this.root, { recursive: true });
    const filename = `${evidenceId}.${extension}`;
    await this.dataSource.transaction(async manager => {
      const [active] = await manager.query<Array<{ id: string }>>(`SELECT u.id FROM users u JOIN employees e ON e.user_id=u.id
        WHERE u.id=$1 AND e.id=$2 AND u.is_active AND e.is_active FOR SHARE OF u,e`, [user.id,user.employeeId]);
      if (!active) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Hồ sơ không còn hoạt động để tải ảnh.' });
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`trip-evidence:${evidenceId.toLowerCase()}`]);
      await manager.query('INSERT INTO business_trip_evidence_uploads(evidence_id,filename,uploaded_by) VALUES($1,$2,$3) ON CONFLICT(evidence_id) DO NOTHING', [evidenceId,filename,user.id]);
      const [owner] = await manager.query<Array<{filename:string;uploaded_by:string|null}>>('SELECT filename,uploaded_by FROM business_trip_evidence_uploads WHERE evidence_id=$1 FOR UPDATE', [evidenceId]);
      if (owner?.uploaded_by !== user.id) throw new BadRequestException({ code: 'BUSINESS_TRIP_EVIDENCE_OWNER_MISMATCH', message: 'Ảnh không thuộc tài khoản này.' });
      if(owner.filename !== filename) throw new BadRequestException({ code:'BUSINESS_TRIP_EVIDENCE_IMMUTABLE',message:'Mã ảnh đã được sử dụng. Chụp ảnh mới với mã mới.' });
      // Exclusive create never clobbers even an untracked legacy file or an orphan
      // from a rolled-back upload. Same-owner, same-bytes retry remains safe.
      try { await writeFile(join(this.root, filename), file.buffer, {flag:'wx'}); }
      catch(error) {
        if((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const current = await readFile(join(this.root,filename));
        if(!current.equals(file.buffer)) throw new BadRequestException({ code:'BUSINESS_TRIP_EVIDENCE_IMMUTABLE',message:'Ảnh đã tải không được ghi đè. Chụp ảnh mới với mã mới.' });
      }
    });
    return { reference: `/api/business-trips/evidence/${filename}` };
  }

  async assertOwnedReference(user: AuthenticatedUserView, reference: string, manager: EntityManager): Promise<void> {
    const match = /^\/api\/business-trips\/evidence\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/i.exec(reference);
    if(!match) throw new BadRequestException({code:'INVALID_BUSINESS_TRIP_EVIDENCE_REFERENCE',message:'Ảnh phải được tải lên hệ thống.'});
    const [owner] = await manager.query<Array<{uploaded_by:string|null}>>('SELECT uploaded_by FROM business_trip_evidence_uploads WHERE filename=$1 FOR UPDATE',[match[1]]);
    if(owner?.uploaded_by !== user.id) throw new BadRequestException({code:'BUSINESS_TRIP_EVIDENCE_OWNER_MISMATCH',message:'Không tìm thấy ảnh của tài khoản này.'});
    await this.read(match[1],user,manager);
  }

  async read(filename: string, user: AuthenticatedUserView, reader: Pick<EntityManager,'query'> = this.dataSource): Promise<BusinessTripEvidenceFile> {
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.exec(
      filename,
    );
    if (!match) {
      throw new NotFoundException({
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_NOT_FOUND',
        message: 'Không tìm thấy ảnh hiện trường.',
      });
    }
    const [owner] = await reader.query<Array<{uploaded_by:string|null}>>('SELECT uploaded_by FROM business_trip_evidence_uploads WHERE filename=$1',[filename]);
    if(!user.roles.includes(RoleCode.Admin) && owner?.uploaded_by !== user.id) throw new NotFoundException({code:'BUSINESS_TRIP_EVIDENCE_FILE_NOT_FOUND',message:'Không tìm thấy ảnh hiện trường.'});
    const [pendingDelete] = await reader.query<Array<{ filename: string }>>("SELECT filename FROM employee_file_cleanup WHERE storage_kind='TRIP' AND filename=$1", [filename]);
    if (pendingDelete) throw new NotFoundException({ code: 'BUSINESS_TRIP_EVIDENCE_FILE_NOT_FOUND', message: 'Không tìm thấy ảnh hiện trường.' });
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
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_NOT_FOUND',
        message: 'Không tìm thấy ảnh hiện trường.',
      });
    }
  }
}
