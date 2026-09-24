import { describe, expect, it } from 'vitest';
import {
  createRefreshSecret,
  formatRefreshToken,
  hashRefreshSecret,
  matchesRefreshSecret,
  parseRefreshToken,
} from '../src/modules/auth/domain/refresh-token.js';

describe('refresh token policy', () => {
  it('formats, parses and verifies an opaque device session credential', () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const secret = createRefreshSecret();
    const parsed = parseRefreshToken(formatRefreshToken(sessionId, secret));

    expect(parsed).toEqual({ sessionId, secret });
    expect(matchesRefreshSecret(secret, hashRefreshSecret(secret))).toBe(true);
    expect(matchesRefreshSecret(`${secret}x`, hashRefreshSecret(secret))).toBe(false);
  });

  it('rejects malformed tokens before database lookup', () => {
    expect(parseRefreshToken('not-a-session-token')).toBeNull();
  });
});
