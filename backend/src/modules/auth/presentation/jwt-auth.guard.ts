import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCESS_TOKEN_SERVICE,
  type AccessTokenPayload,
  type AccessTokenService,
} from '../application/auth.ports.js';
import { AuthService } from '../application/auth.service.js';
import type { AuthenticatedRequest } from './auth-request.js';

interface HttpAuthRequest {
  cookies?: Record<string, string | undefined>;
  headers: { authorization?: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpAuthRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw this.unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.accessTokens.verify(token);
      if (!payload.sid || !payload.sub) throw this.unauthorized();
    } catch {
      throw this.unauthorized();
    }
    // DB/network faults must remain server errors, not a false "invalid session"
    // which would cause clients to delete otherwise valid credentials.
    (request as AuthenticatedRequest).user =
      await this.authService.getAuthenticatedUser(payload.sub, payload.sid);
    (request as AuthenticatedRequest).authSessionId = payload.sid;
    return true;
  }

  private extractToken(request: HttpAuthRequest): string | null {
    const cookieToken = request.cookies?.access_token;
    if (cookieToken) {
      return cookieToken;
    }

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : null;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }
}
