import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from '../application/auth.ports.js';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly rounds = 12;

  hash(value: string): Promise<string> {
    return hash(value, this.rounds);
  }

  compare(value: string, passwordHash: string): Promise<boolean> {
    return compare(value, passwordHash);
  }
}
