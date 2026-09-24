import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface ParsedRefreshToken {
  secret: string;
  sessionId: string;
}

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const sessionId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!sessionIdPattern.test(sessionId) || secret.length < 32) return null;
  return { secret, sessionId };
}

export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function matchesRefreshSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashRefreshSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
