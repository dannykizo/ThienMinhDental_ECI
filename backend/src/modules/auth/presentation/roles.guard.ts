import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleCode } from '../domain/role-code.js';
import type { AuthenticatedRequest } from './auth-request.js';
import { ROLES_METADATA_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.roles.some((role) => requiredRoles.includes(role))) {
      return true;
    }

    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'Bạn không có quyền truy cập khu vực này.',
    });
  }
}
