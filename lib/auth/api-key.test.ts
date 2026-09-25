import { describe, expect, it } from 'vitest';
import {
  API_KEY_PATTERN,
  generateApiKeyMaterial,
  parseApiKeyAuthorization,
} from '@/lib/auth/api-key';

describe('API key material', () => {
  it('generates the documented prefix and secret shape', () => {
    const material = generateApiKeyMaterial();
    expect(material.plaintext).toMatch(API_KEY_PATTERN);
    expect(material.prefix).toMatch(/^[a-f\d]{8}$/);
    expect(material.plaintext).toBe(`cms_${material.prefix}_${material.secret}`);
  });

  it('accepts only a well-formed Bearer credential', () => {
    const { plaintext } = generateApiKeyMaterial();
    expect(parseApiKeyAuthorization(`Bearer ${plaintext}`)).toBe(plaintext);
    expect(() => parseApiKeyAuthorization(null)).toThrow('Unauthorized');
    expect(() => parseApiKeyAuthorization(`Basic ${plaintext}`)).toThrow('Unauthorized');
    expect(() => parseApiKeyAuthorization('Bearer cms_bad_key')).toThrow('Unauthorized');
  });
});
