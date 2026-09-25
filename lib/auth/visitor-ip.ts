import { isIP } from 'node:net';
import { HttpError } from '@/lib/http/errors';

export function normalizedIp(value: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip.includes('%') || !isIP(ip)) return null;
  // Canonicalize IPv6 so equivalent spellings cannot open new rate-limit buckets.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
}

export function requireVisitorIp(value: string | null): string {
  const ip = normalizedIp(value);
  if (ip) return ip;
  throw new HttpError(503, 'INTERNAL_ERROR', 'Visitor identity unavailable');
}

export function platformVisitorIp(headers: Pick<Headers, 'get'>): string {
  // VERCEL is server configuration, never a request header. See Vercel request-header docs.
  if (process.env.VERCEL === '1') return requireVisitorIp(headers.get('x-vercel-forwarded-for'));
  // Opt-in only for a private origin behind nginx which overwrites X-Real-IP.
  if (process.env.CMS_TRUST_PROXY === 'nginx') return requireVisitorIp(headers.get('x-real-ip'));
  if (process.env.NODE_ENV === 'production') return requireVisitorIp(null);
  return 'unknown';
}
