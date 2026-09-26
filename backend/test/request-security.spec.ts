import { describe, expect, it } from 'vitest';
import {
  FixedWindowRateLimiter,
  isTrustedCookieOrigin,
  rateLimitKey,
  requestId,
} from '../src/common/security/request-security.js';

describe('request security', () => {
  it('limits repeated attempts within a fixed window and resets afterwards', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    expect(limiter.consume('client', 100).allowed).toBe(true);
    expect(limiter.consume('client', 200).allowed).toBe(true);
    expect(limiter.consume('client', 300).allowed).toBe(false);
    expect(limiter.consume('client', 1100).allowed).toBe(true);
  });

  it('accepts only exact configured origins for cookie-authenticated writes', () => {
    const allowed = ['https://workforce.example.vn'];
    expect(isTrustedCookieOrigin('https://workforce.example.vn', allowed)).toBe(true);
    expect(isTrustedCookieOrigin('https://evil.example', allowed)).toBe(false);
    expect(isTrustedCookieOrigin(undefined, allowed)).toBe(false);
  });

  it('normalizes rate-limit keys and rejects unsafe request ids', () => {
    expect(rateLimitKey('127.0.0.1', ' Admin@Example.COM ')).toBe(
      '127.0.0.1:admin@example.com',
    );
    expect(requestId('valid-request-id')).toBe('valid-request-id');
    expect(requestId('bad id')).not.toBe('bad id');
  });
});
