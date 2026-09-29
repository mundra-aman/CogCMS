import { describe, expect, it } from 'vitest';
import { resolveContentAction, sanitizeActivityMetadata } from './activity-log';

describe('activity log utilities', () => {
  describe('resolveContentAction', () => {
    it('identifies publication when transitioning from draft to publish', () => {
      expect(resolveContentAction('draft', 'publish')).toBe('publish');
    });

    it('identifies unpublication when transitioning from publish to draft', () => {
      expect(resolveContentAction('publish', 'draft')).toBe('unpublish');
    });

    it('identifies standard update when status remains unchanged', () => {
      expect(resolveContentAction('publish', 'publish')).toBe('update');
      expect(resolveContentAction('draft', 'draft')).toBe('update');
      expect(resolveContentAction(undefined, 'publish')).toBe('update');
    });
  });

  describe('sanitizeActivityMetadata', () => {
    it('strips sensitive keys case-insensitively', () => {
      const sanitized = sanitizeActivityMetadata({
        password: 'super-secret-password',
        PASSWORD_HASH: 'hash123',
        apiToken: 'tok_live_123',
        sessionCookie: 'sid_xyz',
        authHeader: 'Bearer xyz',
        jwtToken: 'jwt.token.value',
        clientSecret: 'secret_value',
        safeProperty: 'hello',
        changedCount: 4,
      });

      expect(sanitized).toEqual({
        safeProperty: 'hello',
        changedCount: 4,
      });
      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).not.toHaveProperty('PASSWORD_HASH');
      expect(sanitized).not.toHaveProperty('apiToken');
      expect(sanitized).not.toHaveProperty('sessionCookie');
      expect(sanitized).not.toHaveProperty('authHeader');
      expect(sanitized).not.toHaveProperty('jwtToken');
      expect(sanitized).not.toHaveProperty('clientSecret');
    });

    it('truncates oversized strings to maintain bounded document size', () => {
      const longString = 'a'.repeat(600);
      const sanitized = sanitizeActivityMetadata({
        contentExcerpt: longString,
      });

      const value = sanitized.contentExcerpt as string;
      expect(value.length).toBe(500);
      expect(value.endsWith('...')).toBe(true);
    });

    it('preserves valid primitive arrays and filters unhandled types', () => {
      const sanitized = sanitizeActivityMetadata({
        fields: ['title', 'slug', 'status'],
        tags: [1, 2, 3],
      });

      expect(sanitized).toEqual({
        fields: ['title', 'slug', 'status'],
        tags: [1, 2, 3],
      });
    });

    it('handles undefined or null metadata gracefully', () => {
      expect(sanitizeActivityMetadata(undefined)).toEqual({});
      expect(sanitizeActivityMetadata(null as unknown as Record<string, unknown>)).toEqual({});
    });
  });
});
