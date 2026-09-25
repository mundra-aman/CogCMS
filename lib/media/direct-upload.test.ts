import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { decodeJwt, SignJWT } from 'jose';
import * as media from '@/lib/aws-s3';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  send: vi.fn(),
  oidc: vi.fn(() => async () => ({ accessKeyId: 'test', secretAccessKey: 'test' })),
}));
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: mocks.post }));
vi.mock('@vercel/oidc-aws-credentials-provider', () => ({ awsCredentialsProvider: mocks.oidc }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    config;
    constructor(config: unknown) {
      this.config = config;
    }
    send = mocks.send;
  },
}));

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==',
  'base64',
);
const identity = {
  userId: 'cccccccccccccccccccccccc',
  siteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  prefix: '../CogNerd',
};
const input = { contentType: 'image/png', size: png.length };
beforeEach(() => {
  vi.stubEnv('S3_REGION', 'ap-south-1');
  vi.stubEnv('AWS_REGION', 'us-east-1');
  vi.stubEnv('S3_BUCKET_NAME', 'cms-media-test');
  vi.stubEnv('S3_PUBLIC_URL', 'https://media.example');
  vi.stubEnv('CMS_JWT_SECRET', 'x'.repeat(32));
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('AWS_ROLE_ARN', 'arn:aws:iam::123456789012:role/cms-preview');
  mocks.post.mockResolvedValue({
    url: 'https://cms-media-test.s3.ap-south-1.amazonaws.com/',
    fields: { key: 'test' },
  });
  mocks.send.mockImplementation(async (cmd) => {
    if (cmd.constructor.name === 'GetObjectCommand')
      return { ContentLength: png.length, ContentType: 'image/png', Body: Readable.from([png]) };
    return {};
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('signed upload intent', () => {
  it('signs only a generated staging object and exact type, with a bounded policy and bound intent', async () => {
    const result = await media.signMediaUpload(input, identity);
    const [client, policy] = mocks.post.mock.calls[0];
    expect(client.config.region).toBe('ap-south-1');
    expect(client.config.credentials).toBeTypeOf('function');
    expect(mocks.oidc).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::123456789012:role/cms-preview',
    });
    expect(policy).toMatchObject({
      Bucket: 'cms-media-test',
      Key: expect.stringMatching(/^staging\/aaaaaaaaaaaaaaaaaaaaaaaa\/[a-f0-9]{32}$/),
      Expires: 300,
      Fields: { 'Content-Type': 'image/png' },
    });
    expect(policy.Conditions).toContainEqual(['content-length-range', 1, 10 * 1024 * 1024]);
    expect(policy.Conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    const claims = decodeJwt(result.ticket);
    expect(claims).toMatchObject({
      sub: identity.userId,
      siteId: identity.siteId,
      purpose: 'media-upload',
      bucketName: 'cms-media-test',
      region: 'ap-south-1',
      publicUrl: 'https://media.example',
      size: png.length,
      contentType: 'image/png',
      stagingKey: policy.Key,
      finalKey: expect.stringMatching(/^sites\/cognerd\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{32}\.png$/),
    });
    expect(claims.exp! - claims.iat!).toBe(300);
    expect(result).not.toHaveProperty('publicUrl');
  });
  it.each([
    { ...input, key: 'sites/other/victim.png' },
    { ...input, bucket: 'attacker' },
    { ...input, prefix: 'other' },
    { ...input, contentType: 'image/svg+xml' },
    { ...input, contentType: 'text/html' },
    { ...input, size: 0 },
    { ...input, size: 10 * 1024 * 1024 + 1 },
    { ...input, size: 1.2 },
  ])('rejects invalid signing input before creating any grant: %j', async (invalid) => {
    await expect(media.signMediaUpload(invalid, identity)).rejects.toMatchObject({ status: 400 });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('accepts the existing full 10 MiB allowance', async () => {
    await expect(
      media.signMediaUpload({ ...input, size: 10 * 1024 * 1024 }, identity),
    ).resolves.toHaveProperty('ticket');
  });
  it('redacts identity and storage failures', async () => {
    mocks.post.mockRejectedValue(new Error('secret-access-key or oidc-token'));
    await expect(media.signMediaUpload(input, identity)).rejects.toMatchObject({
      status: 500,
      message: 'Unable to prepare image upload',
    });
  });
});

describe('validated immutable completion', () => {
  it('rejects a valid-header image with corrupt pixels before publication', async () => {
    const corrupt = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9e0AAAAASUVORK5CYII=',
      'base64',
    );
    const { ticket } = await media.signMediaUpload({ ...input, size: corrupt.length }, identity);
    mocks.send.mockResolvedValueOnce({
      ContentLength: corrupt.length,
      ContentType: 'image/png',
      Body: Readable.from([corrupt]),
    });
    await expect(media.completeMediaUpload({ ticket }, identity)).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.send.mock.calls.some(([cmd]) => cmd.constructor.name === 'PutObjectCommand')).toBe(
      false,
    );
  });
  it('publishes the fetched and decoded bytes using an immutable conditional PUT, then deletes staging', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    const claims = decodeJwt(ticket);
    const result = await media.completeMediaUpload({ ticket }, identity);
    expect(result).toEqual({ url: `https://media.example/${claims.finalKey}` });
    const commands = mocks.send.mock.calls.map(([cmd]) => cmd);
    expect(commands.map((cmd) => cmd.constructor.name)).toEqual([
      'GetObjectCommand',
      'PutObjectCommand',
      'DeleteObjectCommand',
    ]);
    expect(commands[0].input).toMatchObject({ Bucket: 'cms-media-test', Key: claims.stagingKey });
    expect(commands[1].input).toMatchObject({
      Key: claims.finalKey,
      Body: png,
      IfNoneMatch: '*',
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(commands[1].input).not.toHaveProperty('ACL');
  });
  it('rejects forged, wrong-purpose and expired tickets without storage access', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    const claims = decodeJwt(ticket);
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('y'.repeat(32)));
    const wrongPurpose = await new SignJWT({ ...claims, purpose: 'session' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('x'.repeat(32)));
    const expired = await new SignJWT({ ...claims, exp: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('x'.repeat(32)));
    for (const value of [forged, wrongPurpose, expired, 'invalid'])
      await expect(media.completeMediaUpload({ ticket: value }, identity)).rejects.toMatchObject({
        status: 400,
      });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('binds completion to the current user and current site', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    for (const current of [
      { ...identity, userId: 'dddddddddddddddddddddddd' },
      { ...identity, siteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ]) {
      await expect(media.completeMediaUpload({ ticket }, current)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['S3_BUCKET_NAME', 'S3_REGION', 'S3_PUBLIC_URL'])(
    'rejects config changes after signing: %s',
    async (name) => {
      const { ticket } = await media.signMediaUpload(input, identity);
      vi.stubEnv(
        name,
        name === 'S3_PUBLIC_URL'
          ? 'https://other.example'
          : name === 'S3_REGION'
            ? 'us-east-1'
            : 'other-bucket',
      );
      await expect(media.completeMediaUpload({ ticket }, identity)).rejects.toMatchObject({
        status: 400,
      });
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it('rejects caller-supplied keys alongside valid tickets', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    await expect(
      media.completeMediaUpload({ ticket, key: 'sites/other/victim.png' }, identity),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['absent', 'size', 'type', 'truncated', 'overflow', 'invalid-image'])(
    'does not publish an %s upload',
    async (failure) => {
      const { ticket } = await media.signMediaUpload(input, identity);
      mocks.send.mockImplementation(async (cmd) => {
        if (cmd.constructor.name !== 'GetObjectCommand') return {};
        if (failure === 'absent')
          throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return {
          ContentLength: failure === 'size' ? png.length + 1 : png.length,
          ContentType: failure === 'type' ? 'text/html' : 'image/png',
          Body: Readable.from([
            failure === 'truncated'
              ? png.subarray(0, 20)
              : failure === 'overflow'
                ? Buffer.alloc(png.length + 1)
                : failure === 'invalid-image'
                  ? Buffer.alloc(png.length)
                  : png,
          ]),
        };
      });
      await expect(media.completeMediaUpload({ ticket }, identity)).rejects.toMatchObject({
        status: 400,
      });
      expect(
        mocks.send.mock.calls.some(([cmd]) => cmd.constructor.name === 'PutObjectCommand'),
      ).toBe(false);
    },
  );
  it('returns conflict instead of overwriting on a completion replay', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    mocks.send.mockImplementation(async (cmd) => {
      if (cmd.constructor.name === 'GetObjectCommand')
        return { ContentLength: png.length, ContentType: 'image/png', Body: Readable.from([png]) };
      if (cmd.constructor.name === 'PutObjectCommand')
        throw Object.assign(new Error('PreconditionFailed'), {
          $metadata: { httpStatusCode: 412 },
        });
      return {};
    });
    await expect(media.completeMediaUpload({ ticket }, identity)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('keeps successful publication successful when best-effort staging cleanup fails', async () => {
    const { ticket } = await media.signMediaUpload(input, identity);
    mocks.send.mockImplementation(async (cmd) => {
      if (cmd.constructor.name === 'GetObjectCommand')
        return { ContentLength: png.length, ContentType: 'image/png', Body: Readable.from([png]) };
      if (cmd.constructor.name === 'DeleteObjectCommand') throw new Error('secret-request-detail');
      return {};
    });
    await expect(media.completeMediaUpload({ ticket }, identity)).resolves.toHaveProperty('url');
  });
});
