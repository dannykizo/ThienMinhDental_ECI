import type { RoleCode } from './role-code.js';

interface UserAccountProperties {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  employeeId: string | null;
  displayName: string;
  roles: RoleCode[];
}

export class UserAccount {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly isActive: boolean;
  readonly employeeId: string | null;
  readonly displayName: string;
  readonly roles: RoleCode[];

  constructor(properties: UserAccountProperties) {
    this.id = properties.id;
    this.email = properties.email;
    this.passwordHash = properties.passwordHash;
    this.isActive = properties.isActive;
    this.employeeId = properties.employeeId;
    this.displayName = properties.displayName;
    this.roles = [...properties.roles];
  }
}
