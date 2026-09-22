import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthService,
  type AuthenticatedUserView,
} from '../application/auth.service.js';
import { RoleCode } from '../domain/role-code.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginDto } from './login.dto.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

interface SessionResponse {
  user: AuthenticatedUserView;
  accessToken?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.authService.login(input.email, input.password);
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie('access_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
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
