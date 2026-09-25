import { NextRequest, NextResponse } from 'next/server';
import { assertSameOrigin, type AdminContentType } from '@/lib/auth/csrf';
import { requireAdmin, requireUser, type AuthenticatedUser } from '@/lib/auth/require';
import { resolveSite, type ResolvedSite } from '@/lib/site/context';
import { toErrorResponse, validationError } from '@/lib/http/errors';

export type RouteContext<P = Record<string, string>> = { params: Promise<P> };
export type AdminContext<P, S extends boolean> = RouteContext<P> & {
  user: AuthenticatedUser;
  site: S extends true ? ResolvedSite : null;
};
export type AdminHandler<P, S extends boolean = true> = (
  req: NextRequest,
  ctx: AdminContext<P, S>,
) => Promise<NextResponse>;
export type WrappedAdminHandler<P = Record<string, string>> = (
  req: NextRequest,
  ctx: RouteContext<P>,
) => Promise<NextResponse>;

export interface WithAdminOptions<S extends boolean = true> {
  admin?: boolean;
  site?: S;
  contentType?: AdminContentType;
}

/**
 * Wraps an /api/admin/* handler. Next supplies only {params}; the wrapper adds
 * the database-backed user and optional resolved site before invoking the callback.
 */
export function withAdmin<P = Record<string, string>>(
  handler: AdminHandler<P, false>,
  options: WithAdminOptions<false> & { site: false },
): WrappedAdminHandler<P>;
export function withAdmin<P = Record<string, string>>(
  handler: AdminHandler<P, true>,
  options?: WithAdminOptions<true>,
): WrappedAdminHandler<P>;
export function withAdmin<P = Record<string, string>>(
  handler: AdminHandler<P, true> | AdminHandler<P, false>,
  options: WithAdminOptions<boolean> = {},
): WrappedAdminHandler<P> {
  const resolvedOptions = {
    admin: options.admin ?? false,
    site: options.site ?? true,
    contentType: options.contentType ?? 'json',
  } as const;

  return async (req, ctx) => {
    try {
      if (req.method !== 'GET') assertSameOrigin(req, resolvedOptions.contentType);
      const user = await requireUser(req);
      if (resolvedOptions.admin) await requireAdmin(user);
      const site = resolvedOptions.site ? await resolveSite(req, user) : null;
      const stableContext: AdminContext<P, boolean> = { ...ctx, user, site };
      const invoke = handler as AdminHandler<P, boolean>;
      return await invoke(req, stableContext);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parses a JSON body; malformed JSON becomes a 400 VALIDATION_ERROR instead of a 500. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw validationError(null, 'Invalid JSON body');
  }
}
