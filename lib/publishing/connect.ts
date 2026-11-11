import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { requireAdmin, requireSiteAccess, type AuthenticatedUser } from '@/lib/auth/require';
import { issueApiKey, evictApiKeyPrefix, revokeApiKey } from '@/lib/auth/api-key';
import { withApiKey, type ApiHandler } from '@/lib/http/api-handler';
import { readJson } from '@/lib/http/admin-handler';
import { forbidden, HttpError, validationError, toErrorResponse } from '@/lib/http/errors';
import connectToDatabase from '@/lib/mongodb';
import StudioConnectionGrant, { type IStudioConnectionGrant } from '@/models/StudioConnectionGrant';
import ApiKey from '@/models/ApiKey';
import Site from '@/models/Site';
import User from '@/models/User';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const matches = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const connectionParameters = z.object({
  redirectUri: z.string().url().max(2048),
  state: hex,
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  brandLabel: z.string().trim().min(1).max(200),
});
export type ConnectionParameters = z.infer<typeof connectionParameters>;
export function parseConnectionRequest(value: unknown): ConnectionParameters {
  const parsed = connectionParameters.safeParse(value);
  if (!parsed.success) throw validationError(null, 'Invalid connection request');
  const url = new URL(parsed.data.redirectUri);
  const allowed = getEnv()
    .CMS_CONTENT_STUDIO_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !allowed.includes(url.origin) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/dashboard/cms/connect' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
  )
    throw validationError(null, 'This Content Studio address is not approved by the CMS operator');
  return parsed.data;
}
const conflict = () =>
  new HttpError(
    409,
    'CONFLICT',
    'This connection request was already used. Start Connect CMS again.',
  );
const invalid = () =>
  validationError(null, 'Connection request is invalid or expired. Start Connect CMS again.');
export async function authorizeConnection(body: unknown, user: AuthenticatedUser) {
  await requireAdmin(user);
  const request = parseConnectionRequest(body);
  const selection = z.object({ siteId: z.string().regex(/^[a-f0-9]{24}$/i) }).safeParse(body);
  if (!selection.success) throw validationError(null, 'Choose a website');
  requireSiteAccess(user, selection.data.siteId);
  await connectToDatabase();
  const site = await Site.findOne({ _id: selection.data.siteId, status: 'active' }).exec();
  if (!site) throw forbidden();
  const id = hash(JSON.stringify({ ...request, user: user.id }));
  const code = createHmac('sha256', getEnv().CMS_JWT_SECRET)
    .update('studio-connect:' + id)
    .digest('hex');
  let grant = await StudioConnectionGrant.findById(id).exec();
  if (!grant) {
    try {
      grant = await StudioConnectionGrant.create({
        _id: id,
        codeHash: hash(code),
        codeChallenge: request.codeChallenge,
        stateHash: hash(request.state),
        redirectUri: request.redirectUri,
        brandLabel: request.brandLabel,
        siteId: site._id,
        createdBy: user.id,
        expiresAt: new Date(Date.now() + 600_000),
        status: 'approved',
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      grant = await StudioConnectionGrant.findById(id).exec();
    }
  }
  if (!grant) throw invalid();
  // A grant that minted a key is kept without expiry so the same request cannot mint another.
  if (grant.status !== 'approved' || grant.siteId.toString() !== site._id.toString())
    throw conflict();
  if (!grant.expiresAt || grant.expiresAt.getTime() <= Date.now()) throw invalid();
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set('state', request.state);
  redirect.searchParams.set('code', code);
  return { redirectUrl: redirect.toString() };
}
async function grantAuthority(grant: IStudioConnectionGrant) {
  const [issuer, site] = await Promise.all([
    User.findById(grant.createdBy).exec(),
    Site.findOne({ _id: grant.siteId, status: 'active' }).exec(),
  ]);
  if (!issuer || issuer.status !== 'active' || issuer.role !== 'admin' || !site) throw forbidden();
  requireSiteAccess(
    {
      id: issuer._id.toString(),
      role: issuer.role,
      siteIds: issuer.siteIds.map(String),
      name: issuer.name,
      email: issuer.email,
    },
    grant.siteId.toString(),
  );
}
export async function exchangeConnection(body: unknown) {
  const parsed = z
    .object({
      code: hex,
      state: hex,
      verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      redirectUri: z.string().url().max(2048),
      brandLabel: z.string().trim().min(1).max(200),
    })
    .safeParse(body);
  if (!parsed.success) throw invalid();
  const value = parsed.data;
  const challenge = createHash('sha256').update(value.verifier).digest('base64url');
  parseConnectionRequest({ ...value, codeChallenge: challenge });
  await connectToDatabase();
  const grant = await StudioConnectionGrant.findOne({ codeHash: hash(value.code) }).exec();
  if (grant && grant.status !== 'approved') throw conflict();
  if (
    !grant ||
    !grant.expiresAt ||
    grant.expiresAt.getTime() <= Date.now() ||
    !matches(grant.codeChallenge, challenge) ||
    !matches(grant.stateHash, hash(value.state)) ||
    grant.redirectUri !== value.redirectUri ||
    grant.brandLabel !== value.brandLabel
  )
    throw invalid();
  await grantAuthority(grant);
  const claimed = await StudioConnectionGrant.findOneAndUpdate(
    { _id: grant._id, status: 'approved', expiresAt: { $gt: new Date() } },
    { $set: { status: 'consuming' } },
    { returnDocument: 'after' },
  ).exec();
  if (!claimed) throw conflict();
  let issued: Awaited<ReturnType<typeof issueApiKey>> | undefined;
  try {
    issued = await issueApiKey({
      siteId: grant.siteId,
      createdBy: grant.createdBy,
      name: 'Content Studio - ' + grant.brandLabel,
      scopes: ['publishing:connect'],
      expiresAt: new Date(Date.now() + 600_000),
    });
    const recorded = await StudioConnectionGrant.updateOne(
      { _id: grant._id, status: 'consuming' },
      {
        $set: { status: 'issued', apiKeyId: issued.key._id, keyExpiresAt: issued.key.expiresAt },
        $unset: { expiresAt: '' },
      },
    ).exec();
    if (recorded.matchedCount !== 1) throw conflict();
  } catch (error) {
    // Leave no unrecorded key behind, and let Studio retry the same approved code.
    if (issued) await revokeApiKey(issued.key._id.toString()).catch(() => undefined);
    await StudioConnectionGrant.updateOne(
      { _id: grant._id, status: 'consuming' },
      { $set: { status: 'approved' } },
    )
      .exec()
      .catch(() => undefined);
    throw error;
  }
  return { apiKey: issued.plaintext };
}
export const activateConnection: ApiHandler = async (_req, { auth }) => {
  const key = await ApiKey.findById(auth.keyId).exec();
  if (!key || key.revokedAt) throw forbidden();
  if (key.rotatedTo) throw conflict();
  const grant = await StudioConnectionGrant.findOne({
    apiKeyId: key._id,
    siteId: auth.siteId,
  }).exec();
  // Grants that minted a key never expire, so a missing grant is never an old activation.
  if (!grant) throw invalid();
  await grantAuthority(grant);
  if (grant.status !== 'issued' && grant.status !== 'active') throw conflict();
  if (grant.status === 'issued' && (grant.keyExpiresAt?.getTime() ?? 0) <= Date.now())
    throw invalid();
  const promoted = await ApiKey.updateOne(
    { _id: key._id, revokedAt: null, rotatedTo: null },
    { $set: { expiresAt: null, scopes: ['publishing:connect', 'publishing:write'] } },
  ).exec();
  if (promoted.matchedCount !== 1) throw conflict();
  await StudioConnectionGrant.updateOne({ _id: grant._id }, { $set: { status: 'active' } }).exec();
  evictApiKeyPrefix(key.prefix);
  return NextResponse.json({ active: true });
};
export function withConnectionKey(handler: ApiHandler) {
  const wrapped = withApiKey('publishing:connect', handler);
  return async (req: NextRequest, context: Parameters<typeof wrapped>[1]) => {
    const response = await wrapped(req, context);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}
export async function connectionExchangeRoute(req: NextRequest, _context?: unknown) {
  try {
    return NextResponse.json(await exchangeConnection(await readJson(req)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
