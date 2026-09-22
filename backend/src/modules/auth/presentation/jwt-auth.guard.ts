import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCESS_TOKEN_SERVICE,
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

    try {
      const payload = await this.accessTokens.verify(token);
      (request as AuthenticatedRequest).user =
        await this.authService.getActiveUser(payload.sub);
      return true;
    } catch {
      throw this.unauthorized();
    }
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
