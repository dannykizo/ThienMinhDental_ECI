import { ArgumentsHost, Catch, HttpException, Logger, type HttpServer } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';

const outageCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', '08000', '08001', '08003', '08006', '57P01', '57P02', '57P03', '53300']);
function isOutage(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  const error = value as { code?: string; driverError?: unknown; cause?: unknown; errors?: unknown[] };
  return outageCodes.has(error.code ?? '') || isOutage(error.driverError, depth + 1) || isOutage(error.cause, depth + 1)
    || (Array.isArray(error.errors) && error.errors.slice(0, 8).some(item => isOutage(item, depth + 1)));
}

// Production exception logs must not serialize SQL, query parameters or secrets.
@Catch()
export class OperationalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('OperationalError');
  constructor(adapter: HttpServer) { super(adapter); }
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) { super.catch(exception, host); return; }
    const context = host.switchToHttp(), response = context.getResponse<Response>(), request = context.getRequest<Request>();
    const parser = exception as { type?: string; statusCode?: number } | null;
    if (['entity.parse.failed', 'entity.too.large', 'request.size.invalid', 'request.aborted', 'encoding.unsupported', 'charset.unsupported'].includes(parser?.type ?? '')
      && [400, 413, 415].includes(parser?.statusCode ?? 0)) {
      this.applicationRef!.reply(response, { code: 'INVALID_REQUEST_BODY', statusCode: parser!.statusCode, message: 'Nội dung yêu cầu không hợp lệ hoặc vượt giới hạn.' }, parser!.statusCode);
      return;
    }
    const unavailable = isOutage(exception);
    const status = unavailable ? 503 : 500, code = unavailable ? 'DATA_SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR';
    const requestId = response.getHeader('X-Request-Id');
    this.logger.error(JSON.stringify({ event: 'request_failed', code, statusCode: status, requestId, method: request.method, path: request.path }));
    this.applicationRef!.reply(response, { code, statusCode: status, requestId,
      message: unavailable ? 'Dịch vụ dữ liệu tạm thời chưa sẵn sàng. Vui lòng thử lại.' : 'Hệ thống chưa thể xử lý yêu cầu. Không tự gửi lại thao tác; kiểm tra trạng thái trước khi thử lại.' }, status);
  }
}
