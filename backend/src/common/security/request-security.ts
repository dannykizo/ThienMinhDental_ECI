import { randomUUID } from 'node:crypto';

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>();
  private operations = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    this.operations += 1;
    if (this.operations % 100 === 0) this.removeExpired(now);

    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.ensureCapacity(now);
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return {
        allowed: true,
        limit: this.limit,
        remaining: Math.max(0, this.limit - 1),
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    current.count += 1;
    return {
      allowed: current.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  private ensureCapacity(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    this.removeExpired(now);
    if (this.windows.size < this.maxKeys) return;
    const oldestKey = this.windows.keys().next().value;
    if (oldestKey) this.windows.delete(oldestKey);
  }

  private removeExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

export function requestId(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{8,100}$/.test(value)
    ? value
    : randomUUID();
}

export function isTrustedCookieOrigin(
  origin: unknown,
  allowedOrigins: readonly string[],
): boolean {
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export function rateLimitKey(ipAddress: string, account: unknown): string {
  const normalizedAccount =
    typeof account === 'string' ? account.trim().toLowerCase().slice(0, 200) : '';
  return `${ipAddress || 'unknown'}:${normalizedAccount}`;
}
