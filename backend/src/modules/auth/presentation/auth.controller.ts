import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AuthService,
  type AuthenticatedUserView,
  type SessionAuditView,
} from '../application/auth.service.js';
import { RoleCode } from '../domain/role-code.js';
import { CurrentSessionId, CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginDto, RefreshSessionDto } from './login.dto.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

interface SessionResponse {
  user: AuthenticatedUserView;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  sessionExpiresAt?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.authService.login(input.email, input.password, {
      clientType: input.clientType,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ipAddress: request.ip || null,
      userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
    });
    this.setSessionCookies(response, result);

    return {
      accessToken: input.clientType === 'MOBILE' ? result.accessToken : undefined,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      refreshToken: input.clientType === 'MOBILE' ? result.refreshToken : undefined,
      sessionExpiresAt: result.sessionExpiresAt,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() input: RefreshSessionDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const cookieRefreshToken: unknown = request.cookies?.refresh_token;
    const result = await this.authService.refresh(
      input.refreshToken ??
        (typeof cookieRefreshToken === 'string' ? cookieRefreshToken : ''),
    );
    this.setSessionCookies(response, result);
    return {
      accessToken: result.clientType === 'MOBILE' ? result.accessToken : undefined,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      refreshToken: result.clientType === 'MOBILE' ? result.refreshToken : undefined,
      sessionExpiresAt: result.sessionExpiresAt,
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(sessionId);
    response.clearCookie('access_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.clearCookie('refresh_token', {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  @Get('admin/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin)
  listSessions(
    @CurrentSessionId() currentSessionId: string,
  ): Promise<SessionAuditView[]> {
    return this.authService.listSessions(currentSessionId);
  }

  @Post('admin/sessions/:sessionId/revoke')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin)
  revokeSession(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(sessionId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUserView): SessionResponse {
    return { user };
  }

  @Get('admin-session')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleCode.Admin,
    RoleCode.ChiefAccountant,
    RoleCode.AreaManager,
    RoleCode.Manager,
  )
  adminSession(@CurrentUser() user: AuthenticatedUserView): SessionResponse {
    return { user };
  }

  private setSessionCookies(
    response: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ): void {
    if (result.clientType !== 'WEB') return;
    const secure = process.env.NODE_ENV === 'production';
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      expires: new Date(result.accessTokenExpiresAt),
      sameSite: 'lax',
      secure,
    });
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      expires: new Date(result.sessionExpiresAt),
      path: '/api/auth',
      sameSite: 'lax',
      secure,
    });
  }
}
