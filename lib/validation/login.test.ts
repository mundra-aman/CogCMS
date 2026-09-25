import { describe, expect, it } from 'vitest';
import { loginSchema } from './login';

describe('login validation', () => {
  it('normalizes a valid login', () => {
    expect(
      loginSchema.parse({ email: 'Admin@Example.com', password: 'secret', rememberMe: true }),
    ).toEqual({ email: 'admin@example.com', password: 'secret', rememberMe: true });
  });

  it('rejects unknown fields and malformed email', () => {
    expect(loginSchema.safeParse({ email: 'no', password: 'x' }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@example.com', password: 'x', siteId: 'injected' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@example.com', password: 'x'.repeat(73) }).success,
    ).toBe(false);
  });
});
