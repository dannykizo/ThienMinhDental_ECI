import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type {
  LoginAlertInput,
  LoginAlertResult,
  LoginAlertSender,
} from '../application/auth.ports.js';

@Injectable()
export class SmtpLoginAlertSender implements LoginAlertSender {
  constructor(private readonly config: ConfigService) {}

  async send(input: LoginAlertInput): Promise<LoginAlertResult> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const recipients = (this.config.get<string>('ADMIN_LOGIN_ALERT_EMAILS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!host || !from || recipients.length === 0) {
      return { status: 'SKIPPED', note: 'SMTP_NOT_CONFIGURED' };
    }

    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';
    const username = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: username && password ? { user: username, pass: password } : undefined,
    });

    await transport.sendMail({
      from,
      to: recipients,
      subject: `[Thiên Minh Workforce] ${input.displayName} vừa đăng nhập`,
      text: [
        'Hệ thống ghi nhận một phiên đăng nhập mới.',
        `Nhân sự: ${input.displayName}`,
        `Tài khoản: ${input.accountEmail}`,
        `Thiết bị: ${input.deviceName}`,
        `Ứng dụng: ${input.clientType}`,
        `Địa chỉ mạng: ${input.ipAddress ?? 'Không xác định'}`,
        `Thời gian: ${input.signedInAt.toISOString()}`,
        '',
        'Nếu đây không phải thao tác hợp lệ, hãy thu hồi phiên trong Admin Web.',
      ].join('\n'),
    });

    return { status: 'SENT', note: null };
  }
}
