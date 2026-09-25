import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_COST, verifyPassword } from './password';

describe('password helpers', () => {
  it('hashes at bcrypt cost 12 and verifies the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(bcrypt.getRounds(hash)).toBe(PASSWORD_COST);
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('runs the cached dummy-hash path but never authenticates without a real hash', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything')).resolves.toBe(false);
  });

  it('refuses bcrypt-truncated passwords for direct callers', async () => {
    const tooLong = '😀'.repeat(19);
    await expect(hashPassword(tooLong)).rejects.toThrow(/72 UTF-8 bytes/);
    const hash = await hashPassword('a'.repeat(72));
    await expect(verifyPassword(`${'a'.repeat(72)}suffix`, hash)).resolves.toBe(false);
  });
});
