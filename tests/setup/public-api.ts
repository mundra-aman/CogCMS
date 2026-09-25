import { NextRequest } from 'next/server';
import type { ISite } from '@/models/Site';
import type { IUser } from '@/models/User';
import type { ApiKeyScope } from '@/models/ApiKey';
import { issueApiKey } from '@/lib/auth/api-key';

export async function issueTestApiKey(
  site: ISite,
  user: IUser,
  scopes: ApiKeyScope[] = ['content:read'],
): Promise<string> {
  const issued = await issueApiKey({
    siteId: site._id,
    name: 'Test consumer',
    scopes,
    createdBy: user._id,
  });
  return issued.plaintext;
}

export function publicApiRequest(
  url: string,
  key: string,
  options: { method?: string; json?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${key}`);
  if (options.json !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(url, {
    method,
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
}
