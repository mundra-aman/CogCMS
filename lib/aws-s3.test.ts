import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildS3ObjectKey,
  buildS3PublicUrl,
  getS3Config,
  safeMediaPrefix,
  trustedImageExtension,
} from '@/lib/aws-s3';
import * as media from '@/lib/aws-s3';

describe('native S3 media storage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('derives the extension from trusted MIME data, not the client filename', () => {
    expect(trustedImageExtension('image/jpeg')).toBe('.jpg');
    expect(trustedImageExtension('image/svg+xml')).toBeNull();
    expect(trustedImageExtension('application/octet-stream')).toBeNull();
  });

  it('normalizes traversal and unsafe site prefixes', () => {
    expect(safeMediaPrefix('../Client Site/../../private')).toBe('client-site-private');
    expect(safeMediaPrefix('  ')).toBe('site');
  });

  it('builds immutable per-site keys and CloudFront URLs', () => {
    const key = buildS3ObjectKey(
      'CogNerd Website',
      'image/webp',
      new Date('2026-09-02T12:00:00.000Z'),
      'abcdef',
    );
    expect(key).toBe('sites/cognerd-website/2026-09-02/abcdef.webp');
    expect(buildS3PublicUrl('https://media.example.com/', key!)).toBe(
      'https://media.example.com/sites/cognerd-website/2026-09-02/abcdef.webp',
    );
  });

  it('uses only region, bucket, and public origin so credentials stay in the IAM chain', () => {
    vi.stubEnv('S3_REGION', 'ap-south-1');
    vi.stubEnv('S3_BUCKET_NAME', 'cognerd-cms-media');
    vi.stubEnv('S3_PUBLIC_URL', 'https://media.cognerd.ai/');
    expect(getS3Config()).toEqual({
      region: 'ap-south-1',
      bucketName: 'cognerd-cms-media',
      publicUrl: 'https://media.cognerd.ai',
    });
    expect(getS3Config()).not.toHaveProperty('credentials');
  });

  it('requires an explicit Vercel OIDC role and never uses ambient region or credentials', async () => {
    vi.stubEnv('S3_REGION', 'ap-south-1');
    vi.stubEnv('S3_BUCKET_NAME', 'cognerd-cms-media');
    vi.stubEnv('S3_PUBLIC_URL', 'https://media.cognerd.ai');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('AWS_ROLE_ARN', '');
    expect(() => media.createMediaClient(getS3Config()!)).toThrow('AWS_ROLE_ARN');
  });
});
