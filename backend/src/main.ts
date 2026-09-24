import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  const isProduction = process.env.NODE_ENV === 'production';
  const express = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: unknown): void;
  };

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  express.disable('x-powered-by');
  if (isProduction || process.env.TRUST_PROXY === 'true') {
    express.set('trust proxy', 1);
  }
  app.use(cookieParser());
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? ['http://localhost:3000'],
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
