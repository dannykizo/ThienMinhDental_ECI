import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import {
  FixedWindowRateLimiter,
  isTrustedCookieOrigin,
  rateLimitKey,
  requestId,
} from './common/security/request-security.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  const isProduction = process.env.NODE_ENV === 'production';
  const express = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: unknown): void;
  };
  const allowedOrigins =
    process.env.CORS_ORIGIN?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? ['http://localhost:3000'];
  const loginLimiter = new FixedWindowRateLimiter(
    Number(process.env.AUTH_LOGIN_RATE_LIMIT ?? 10),
    Number(process.env.AUTH_LOGIN_RATE_WINDOW_SECONDS ?? 900) * 1000,
  );
  const refreshLimiter = new FixedWindowRateLimiter(
    Number(process.env.AUTH_REFRESH_RATE_LIMIT ?? 60),
    Number(process.env.AUTH_REFRESH_RATE_WINDOW_SECONDS ?? 900) * 1000,
  );
  const logger = new Logger('HTTP');

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  express.disable('x-powered-by');
  if (isProduction || process.env.TRUST_PROXY === 'true') {
    express.set('trust proxy', 1);
  }
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const id = requestId(request.get('x-request-id'));
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', id);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');

    if (isProduction) {
      response.once('finish', () => {
        logger.log(JSON.stringify({
          durationMs: Date.now() - startedAt,
          method: request.method,
          path: request.path,
          requestId: id,
          statusCode: response.statusCode,
        }));
      });
    }

    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const hasSessionCookie = Boolean(
      request.cookies?.access_token || request.cookies?.refresh_token,
    );
    if (
      isProduction &&
      unsafeMethod &&
      hasSessionCookie &&
      !isTrustedCookieOrigin(request.get('origin'), allowedOrigins)
    ) {
      response.status(403).json({
        code: 'UNTRUSTED_REQUEST_ORIGIN',
        message: 'Nguồn gửi yêu cầu không được phép.',
        requestId: id,
      });
      return;
    }

    const requestPath = request.originalUrl.split('?')[0];
    const isLogin = request.method === 'POST' && requestPath === '/api/auth/login';
    const isRefresh = request.method === 'POST' && requestPath === '/api/auth/refresh';
    if (isLogin || isRefresh) {
      const account = isLogin && request.body && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>).email
        : '';
      const result = (isLogin ? loginLimiter : refreshLimiter).consume(
        rateLimitKey(request.ip ?? 'unknown', account),
      );
      response.setHeader('X-RateLimit-Limit', result.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      if (!result.allowed) {
        response.setHeader('Retry-After', result.retryAfterSeconds);
        response.status(429).json({
          code: 'AUTH_RATE_LIMITED',
          message: 'Có quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.',
          requestId: id,
        });
        return;
      }
    }
    next();
  });
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
