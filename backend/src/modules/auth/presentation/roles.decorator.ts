import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '../domain/role-code.js';

export const ROLES_METADATA_KEY = 'required_roles';
export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
