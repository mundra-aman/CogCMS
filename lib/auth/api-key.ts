import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { forbiddenScope, HttpError, unauthorized, validationError } from '@/lib/http/errors';
import ApiKey, { type ApiKeyScope, type IApiKey } from '@/models/ApiKey';

export const API_KEY_PATTERN = /^cms_([a-f\d]{8})_([A-Za-z\d_-]{32})$/;
export const API_KEY_CACHE_MS = 5 * 60 * 1000;
export const LAST_USED_WRITE_MS = 60 * 1000;
const BCRYPT_COST = 10;

type CacheEntry = {
  digest: Buffer;
  keyHash: string;
  keyId: string;
  cachedUntil: number;
  lastUsedWrittenAt: number;
};

const cache = new Map<string, CacheEntry>();

export type ApiKeyAuth = {
  keyId: string;
  siteId: string;
  prefix: string;
  scopes: ApiKeyScope[];
};

export type ApiKeyView = {
  id: string;
  siteId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFrom: string | null;
  rotatedTo: string | null;
  createdAt: string;
};

export function generateApiKeyMaterial(): { prefix: string; secret: string; plaintext: string } {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  return { prefix, secret, plaintext: `cms_${prefix}_${secret}` };
}

export function parseApiKeyAuthorization(value: string | null): string {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  if (!match || !API_KEY_PATTERN.test(match[1])) throw unauthorized();
  return match[1];
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function keyPrefix(value: string): string {
  const match = API_KEY_PATTERN.exec(value);
  if (!match) throw unauthorized();
  return match[1];
}

function active(key: Pick<IApiKey, 'revokedAt' | 'expiresAt'>, now: Date): boolean {
  return !key.revokedAt && (!key.expiresAt || key.expiresAt.getTime() > now.getTime());
}

function updateLastUsed(entry: CacheEntry, now: Date): void {
  if (now.getTime() - entry.lastUsedWrittenAt < LAST_USED_WRITE_MS) return;
  entry.lastUsedWrittenAt = now.getTime();
  void ApiKey.updateOne({ _id: entry.keyId }, { $set: { lastUsedAt: now } })
    .exec()
    .catch(() => console.warn('[cms] API key usage timestamp failed'));
}

export async function authenticateApiKey(
  req: Pick<NextRequest, 'headers'>,
  requiredScope: ApiKeyScope,
  now = new Date(),
): Promise<ApiKeyAuth> {
  const plaintext = parseApiKeyAuthorization(req.headers.get('authorization'));
  const prefix = keyPrefix(plaintext);
  const presentedDigest = digest(plaintext);
  const cached = cache.get(prefix);

  // Mongo is authoritative on every request, including warm instances. Cache only bcrypt work.
  await connectToDatabase();
  const key = await ApiKey.findOne({ prefix }).select('+keyHash').exec();
  if (!key || !active(key, now)) {
    cache.delete(prefix);
    throw unauthorized();
  }

  if (cached && cached.cachedUntil > now.getTime() && cached.keyHash === key.keyHash) {
    if (!timingSafeEqual(presentedDigest, cached.digest)) throw unauthorized();
    if (!key.scopes.includes(requiredScope)) throw forbiddenScope();
    cached.keyId = key._id.toString();
    updateLastUsed(cached, now);
    return {
      keyId: cached.keyId,
      siteId: key.siteId.toString(),
      prefix,
      scopes: [...key.scopes],
    };
  }

  cache.delete(prefix);
  if (!(await compare(plaintext, key.keyHash))) throw unauthorized();
  if (!key.scopes.includes(requiredScope)) throw forbiddenScope();

  const entry: CacheEntry = {
    digest: presentedDigest,
    keyHash: key.keyHash,
    keyId: key._id.toString(),
    cachedUntil: now.getTime() + API_KEY_CACHE_MS,
    lastUsedWrittenAt: key.lastUsedAt?.getTime() ?? 0,
  };
  cache.set(prefix, entry);
  updateLastUsed(entry, now);
  return { keyId: entry.keyId, siteId: key.siteId.toString(), prefix, scopes: [...key.scopes] };
}

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

export async function issueApiKey(input: {
  siteId: string | Types.ObjectId;
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date | null;
  createdBy: string | Types.ObjectId;
  rotatedFrom?: string | Types.ObjectId | null;
}): Promise<{ key: IApiKey; plaintext: string }> {
  const now = new Date();
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw validationError({ expiresAt: ['Expiration must be in the future'] });
  }
  await connectToDatabase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const material = generateApiKeyMaterial();
    try {
      const key = await ApiKey.create({
        siteId: input.siteId,
        name: input.name,
        prefix: material.prefix,
        keyHash: await hash(material.plaintext, BCRYPT_COST),
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        rotatedFrom: input.rotatedFrom ?? null,
        createdBy: input.createdBy,
      });
      return { key, plaintext: material.plaintext };
    } catch (error) {
      if (!duplicateKey(error) || attempt === 3) throw error;
    }
  }
  throw new Error('Could not allocate a unique API key prefix');
}

export async function revokeApiKey(id: string, now = new Date()): Promise<IApiKey> {
  if (!Types.ObjectId.isValid(id)) throw validationError({ id: ['Invalid API key id'] });
  await connectToDatabase();
  const key = await ApiKey.findById(id).exec();
  if (!key) throw new HttpError(404, 'NOT_FOUND', 'API key not found');
  if (!key.revokedAt) {
    key.revokedAt = now;
    await key.save();
  }
  evictApiKeyPrefix(key.prefix);
  return key;
}

export async function rotateApiKey(
  id: string,
  createdBy: string | Types.ObjectId,
  now = new Date(),
): Promise<{ key: IApiKey; plaintext: string }> {
  if (!Types.ObjectId.isValid(id)) throw validationError({ id: ['Invalid API key id'] });
  await connectToDatabase();
  const old = await ApiKey.findById(id).exec();
  if (!old) throw new HttpError(404, 'NOT_FOUND', 'API key not found');
  if (!active(old, now)) throw new HttpError(409, 'CONFLICT', 'Only an active API key can rotate');

  const replacement = await issueApiKey({
    siteId: old.siteId,
    name: old.name,
    scopes: [...old.scopes],
    expiresAt: old.expiresAt,
    createdBy,
    rotatedFrom: old._id,
  });
  const graceExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (!old.expiresAt || old.expiresAt.getTime() > graceExpiry.getTime())
    old.expiresAt = graceExpiry;
  old.rotatedTo = replacement.key._id;
  await old.save();
  evictApiKeyPrefix(old.prefix);
  return replacement;
}

export function serializeApiKey(key: IApiKey): ApiKeyView {
  return {
    id: key._id.toString(),
    siteId: key.siteId.toString(),
    name: key.name,
    prefix: key.prefix,
    scopes: [...key.scopes],
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    rotatedFrom: key.rotatedFrom?.toString() ?? null,
    rotatedTo: key.rotatedTo?.toString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}

export function evictApiKeyPrefix(prefix: string): void {
  cache.delete(prefix);
}

export function clearApiKeyCache(): void {
  cache.clear();
}
