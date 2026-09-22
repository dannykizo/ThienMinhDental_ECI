import { describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/bcrypt-password-hasher.js';

describe('BcryptPasswordHasher', () => {
  it('hashes passwords and verifies only the matching plaintext', async () => {
    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash('development-password');

    expect(passwordHash).not.toBe('development-password');
    await expect(
      hasher.compare('development-password', passwordHash),
    ).resolves.toBe(true);
    await expect(hasher.compare('wrong-password', passwordHash)).resolves.toBe(
      false,
    );
  });
});
