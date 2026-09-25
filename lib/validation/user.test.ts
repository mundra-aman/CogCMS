import { describe, expect, it } from 'vitest';
import { changePasswordSchema, createUserSchema, updateUserSchema } from './user';

describe('user validation', () => {
  const siteId = '507f1f77bcf86cd799439011';
  const valid = {
    email: 'Editor@Example.com',
    name: 'Editor',
    role: 'editor' as const,
    siteIds: [siteId],
    password: 'correct-horse-battery',
  };

  it('normalizes email and accepts an assigned editor', () => {
    expect(createUserSchema.parse(valid).email).toBe('editor@example.com');
  });

  it('rejects an unassigned editor and duplicate assignments', () => {
    expect(createUserSchema.safeParse({ ...valid, siteIds: [] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, siteIds: [siteId, siteId] }).success).toBe(false);
  });

  it('rejects server-owned fields and empty updates', () => {
    expect(createUserSchema.safeParse({ ...valid, passwordHash: 'nope' }).success).toBe(false);
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it('requires a different new password', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'same-password', newPassword: 'same-password' })
        .success,
    ).toBe(false);
  });

  it('rejects passwords bcrypt would silently truncate', () => {
    expect(createUserSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(false);
  });
});
