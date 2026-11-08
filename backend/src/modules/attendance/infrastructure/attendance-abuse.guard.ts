import { type CanActivate, type ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/presentation/auth-request.js';

type Bucket = 'CAPTURE' | 'UPLOAD' | 'EVENT';
const limits: Record<Bucket, number> = { CAPTURE: 10, UPLOAD: 20, EVENT: 60 };
const metadata = 'attendance-abuse-bucket';
export const AttendanceBudget = (bucket: Bucket): MethodDecorator => SetMetadata(metadata, bucket);

@Injectable()
export class AttendanceAbuseGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly source: DataSource, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.get<Bucket>(metadata, context.getHandler());
    if (!bucket) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.id) throw new HttpException({code:'AUTHENTICATION_REQUIRED',message:'Vui lòng đăng nhập.'},401);
    const limit = limits[bucket];
    // Atomic shared database budget, bounded to three rows/account, survives API restart.
    const [row] = await this.source.query<Array<{ attempts: number; retry_after: number }>>(`INSERT INTO attendance_abuse_budgets(user_id,bucket,window_start,attempts)
      VALUES($1,$2,date_trunc('minute',clock_timestamp()),1)
      ON CONFLICT(user_id,bucket) DO UPDATE SET
        attempts=CASE WHEN attendance_abuse_budgets.window_start=date_trunc('minute',clock_timestamp()) THEN LEAST(attendance_abuse_budgets.attempts+1,$3+1) ELSE 1 END,
        window_start=date_trunc('minute',clock_timestamp())
      RETURNING attempts,GREATEST(1,ceil(extract(epoch FROM window_start+interval '1 minute'-clock_timestamp())))::int AS retry_after`,[request.user.id,bucket,limit]);
    if (row.attempts > limit) {
      context.switchToHttp().getResponse<{setHeader:(name:string,value:string)=>void}>().setHeader('Retry-After',String(row.retry_after));
      throw new HttpException({ code:'ATTENDANCE_RATE_LIMITED',message:'Gửi quá nhiều yêu cầu chấm công/ảnh. Chờ hết thời gian giới hạn, tải lại trạng thái rồi thử lại.',retryAfterSeconds:row.retry_after },429);
    }
    return true;
  }
}
