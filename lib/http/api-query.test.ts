import { describe, expect, it } from 'vitest';
import { parsePagination } from '@/lib/http/api-query';

describe('v1 pagination', () => {
  it('defaults to page 1 and limit 20', () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('accepts the maximum and rejects invalid or excessive values', () => {
    expect(parsePagination(new URLSearchParams('page=2&limit=100'))).toEqual({
      page: 2,
      limit: 100,
      skip: 100,
    });
    for (const query of ['limit=101', 'limit=0', 'page=0', 'limit=1.5', 'page=nope']) {
      expect(() => parsePagination(new URLSearchParams(query))).toThrow('Invalid query');
    }
  });
});
