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
import { LoginDto } from './login.dto.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

interface SessionResponse {
  user: AuthenticatedUserView;
  accessToken?: string;
  expiresAt?: string;
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
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      expires: new Date(result.expiresAt),
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
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
}
