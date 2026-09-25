import { validationError } from '@/lib/http/errors';

export type Pagination = { page: number; limit: number; skip: number };

function positiveInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const page = positiveInteger(searchParams.get('page'), 1);
  const limit = positiveInteger(searchParams.get('limit'), 20);
  if (page === null || limit === null || limit > 100) {
    throw validationError(
      { page: searchParams.get('page'), limit: searchParams.get('limit'), maxLimit: 100 },
      'Invalid query',
    );
  }
  return { page, limit, skip: (page - 1) * limit };
}

export function commaList(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function assertKnownQuery(searchParams: URLSearchParams, allowed: readonly string[]): void {
  const known = new Set(allowed);
  const unknown = [...new Set([...searchParams.keys()].filter((key) => !known.has(key)))];
  if (unknown.length > 0) throw validationError({ unknown }, 'Invalid query');
}
