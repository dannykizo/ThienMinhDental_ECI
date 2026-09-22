import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AccessTokenPayload,
  AccessTokenService,
} from '../application/auth.ports.js';

@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verify(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }
}
