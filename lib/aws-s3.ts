import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { HttpError, validationError } from '@/lib/http/errors';
import { validateImage } from '@/lib/media/validate-image';

export type S3MediaConfig = { region: string; bucketName: string; publicUrl: string };
type UploadIdentity = { userId: string; siteId: string; prefix: string };
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const INTENT_TTL_SECONDS = 300;
const STORAGE_TIMEOUT_MS = 15_000;
const INTENT_ISSUER = 'cognerd-cms';
const INTENT_AUDIENCE = 'media-upload-completion';

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

function normalizedPublicUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getS3Config(): S3MediaConfig | null {
  const region = process.env.S3_REGION?.trim();
  const bucketName = process.env.S3_BUCKET_NAME?.trim();
  const publicUrl = process.env.S3_PUBLIC_URL
    ? normalizedPublicUrl(process.env.S3_PUBLIC_URL)
    : null;
  if (
    !region ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) ||
    !bucketName ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName) ||
    !publicUrl
  )
    return null;
  return { region, bucketName, publicUrl };
}

export function isS3Configured(): boolean {
  return getS3Config() !== null;
}

export function trustedImageExtension(mimeType: string): string | null {
  return IMAGE_EXTENSIONS[mimeType.toLowerCase()] ?? null;
}

export function safeMediaPrefix(prefix: string): string {
  const safe = prefix
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || 'site';
}

export function buildS3ObjectKey(
  prefix: string,
  mimeType: string,
  now = new Date(),
  randomHex = crypto.randomBytes(16).toString('hex'),
): string | null {
  const extension = trustedImageExtension(mimeType);
  if (!extension) return null;
  return `sites/${safeMediaPrefix(prefix)}/${now.toISOString().slice(0, 10)}/${randomHex}${extension}`;
}

export function buildS3PublicUrl(publicUrl: string, key: string): string {
  const origin = normalizedPublicUrl(publicUrl);
  if (!origin) throw new Error('S3_PUBLIC_URL must be an HTTP(S) origin');
  return `${origin}/${key}`;
}

/** Vercel must use its explicitly trusted role. Local development may use SDK identity. */
export function createMediaClient(config: S3MediaConfig): S3Client {
  const hosted = process.env.VERCEL === '1';
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  if (hosted && !/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(roleArn ?? '')) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'AWS_ROLE_ARN is required for Vercel uploads');
  }
  return new S3Client({
    region: config.region,
    ...(hosted ? { credentials: awsCredentialsProvider({ roleArn: roleArn! }) } : {}),
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 3_000, requestTimeout: STORAGE_TIMEOUT_MS },
  });
}

function requireConfig(): S3MediaConfig {
  const config = getS3Config();
  if (!config) throw new HttpError(500, 'INTERNAL_ERROR', 'AWS S3 is not configured for uploads');
  return config;
}

function intentSecret(): Uint8Array {
  const secret = process.env.CMS_JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(500, 'INTERNAL_ERROR', 'Media signing is not configured');
  return new TextEncoder().encode(secret);
}

const uploadSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
    size: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  })
  .strict();
const completionSchema = z.object({ ticket: z.string().min(1).max(4096) }).strict();
const intentSchema = uploadSchema
  .extend({
    purpose: z.literal('media-upload'),
    sub: z.string().regex(/^[a-f0-9]{24}$/),
    siteId: z.string().regex(/^[a-f0-9]{24}$/),
    bucketName: z.string(),
    region: z.string(),
    publicUrl: z.string(),
    stagingKey: z.string(),
    finalKey: z.string(),
    iat: z.number().int(),
    exp: z.number().int(),
    iss: z.literal(INTENT_ISSUER),
    aud: z.literal(INTENT_AUDIENCE),
  })
  .strict();

/** Also bounds credential resolution, which happens before the S3 HTTP request. */
async function bounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms = STORAGE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Storage operation timed out'));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function signMediaUpload(payload: unknown, identity: UploadIdentity) {
  const parsed = uploadSchema.safeParse(payload);
  if (!parsed.success)
    throw validationError(null, 'Choose a supported image between 1 byte and 10 MiB');
  if (!/^[a-f0-9]{24}$/.test(identity.siteId) || !/^[a-f0-9]{24}$/.test(identity.userId)) {
    throw validationError(null, 'Invalid upload identity');
  }
  const config = requireConfig();
  const secret = intentSecret();
  const client = createMediaClient(config);
  const random = crypto.randomBytes(16).toString('hex');
  const stagingKey = `staging/${identity.siteId}/${random}`;
  const finalKey = buildS3ObjectKey(identity.prefix, parsed.data.contentType, new Date(), random)!;
  try {
    const grant = await bounded(() =>
      createPresignedPost(client, {
        Bucket: config.bucketName,
        Key: stagingKey,
        Expires: INTENT_TTL_SECONDS,
        Fields: { 'Content-Type': parsed.data.contentType, success_action_status: '204' },
        Conditions: [
          ['content-length-range', 1, MAX_MEDIA_BYTES],
          ['eq', '$Content-Type', parsed.data.contentType],
        ],
      }),
    );
    const ticket = await new SignJWT({
      ...parsed.data,
      ...config,
      purpose: 'media-upload',
      siteId: identity.siteId,
      stagingKey,
      finalKey,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(identity.userId)
      .setIssuer(INTENT_ISSUER)
      .setAudience(INTENT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${INTENT_TTL_SECONDS}s`)
      .sign(secret);
    return { ...grant, ticket };
  } catch {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Unable to prepare image upload');
  }
}

async function verifyIntent(payload: unknown, identity: UploadIdentity, config: S3MediaConfig) {
  const input = completionSchema.safeParse(payload);
  if (!input.success) throw validationError(null, 'Invalid or expired upload intent');
  const secret = intentSecret();
  try {
    const { payload: claims } = await jwtVerify(input.data.ticket, secret, {
      algorithms: ['HS256'],
      issuer: INTENT_ISSUER,
      audience: INTENT_AUDIENCE,
      requiredClaims: ['exp', 'iat', 'sub'],
      maxTokenAge: INTENT_TTL_SECONDS,
    });
    const intent = intentSchema.parse(claims);
    const random = intent.stagingKey.split('/')[2];
    if (
      intent.sub !== identity.userId ||
      intent.siteId !== identity.siteId ||
      intent.bucketName !== config.bucketName ||
      intent.region !== config.region ||
      intent.publicUrl !== config.publicUrl ||
      intent.exp - intent.iat !== INTENT_TTL_SECONDS ||
      !/^[a-f0-9]{32}$/.test(random ?? '') ||
      intent.stagingKey !== `staging/${identity.siteId}/${random}` ||
      !new RegExp(
        `^sites/[a-z0-9_-]{1,80}/\\d{4}-\\d{2}-\\d{2}/${random}\\${trustedImageExtension(intent.contentType)}$`,
      ).test(intent.finalKey)
    ) {
      throw new Error('Mismatched intent');
    }
    return intent;
  } catch {
    throw validationError(null, 'Invalid or expired upload intent');
  }
}

export async function completeMediaUpload(
  payload: unknown,
  identity: UploadIdentity,
): Promise<{ url: string }> {
  const config = requireConfig();
  const intent = await verifyIntent(payload, identity, config);
  const client = createMediaClient(config);
  try {
    const bytes = await bounded(async (signal) => {
      const object = await client.send(
        new GetObjectCommand({ Bucket: config.bucketName, Key: intent.stagingKey }),
        { abortSignal: signal },
      );
      const body = object.Body;
      if (!(body instanceof Readable)) throw validationError(null, 'Upload is incomplete');
      const abort = () => body.destroy(new Error('Storage operation timed out'));
      signal.addEventListener('abort', abort, { once: true });
      try {
        if (object.ContentLength !== intent.size || object.ContentType !== intent.contentType)
          throw validationError(null, 'Uploaded image does not match its intent');
        const bytes = Buffer.alloc(intent.size);
        let offset = 0;
        for await (const chunk of body) {
          if (!(chunk instanceof Uint8Array) || offset + chunk.length > intent.size)
            throw validationError(null, 'Uploaded image exceeds its declared size');
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        if (offset !== intent.size) throw validationError(null, 'Upload is incomplete');
        return bytes;
      } finally {
        signal.removeEventListener('abort', abort);
        body.destroy();
      }
    });
    await validateImage(bytes, intent.contentType);
    // Publish only the exact bytes we validated: a replay can replace staging at any time.
    await bounded((signal) =>
      client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: intent.finalKey,
          Body: bytes,
          ContentType: intent.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
          IfNoneMatch: '*',
        }),
        { abortSignal: signal },
      ),
    );
    try {
      await bounded(
        (signal) =>
          client.send(
            new DeleteObjectCommand({ Bucket: config.bucketName, Key: intent.stagingKey }),
            { abortSignal: signal },
          ),
        3_000,
      );
    } catch {
      /* Lifecycle expires abandoned and replayed staging objects. */
    }
    return { url: buildS3PublicUrl(config.publicUrl, intent.finalKey) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const storageError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (storageError.name === 'NoSuchKey' || storageError.$metadata?.httpStatusCode === 404)
      throw validationError(null, 'Upload is incomplete');
    if ([409, 412].includes(storageError.$metadata?.httpStatusCode ?? 0))
      throw new HttpError(409, 'CONFLICT', 'Image was already completed; start a new upload');
    throw new HttpError(500, 'INTERNAL_ERROR', 'Unable to complete image upload');
  }
}
