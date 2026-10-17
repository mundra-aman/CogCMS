import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/server after() so dispatch.ts can be imported in unit tests.
const after = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after,
}));

import { signWebhookPayload } from '@/lib/webhooks/sign';
import {
  deliverSubscriptionWebhook,
  SUBSCRIPTION_RETRY_DELAY_MS,
  SUBSCRIPTION_TIMEOUT_MS,
} from '@/lib/webhooks/deliver';
import { dispatchSubscriptionWebhooks } from '@/lib/webhooks/dispatch';

// ---------------------------------------------------------------------------
// sign.ts
// ---------------------------------------------------------------------------
describe('signWebhookPayload', () => {
  it('produces a sha256=<hex> string matching manual HMAC-SHA256 over timestamp.body', () => {
    const secret = 'test-secret';
    const timestamp = '1788429600';
    const body = JSON.stringify({ type: 'content.published', id: '123' });
    const expected = `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;
    expect(signWebhookPayload(secret, timestamp, body)).toBe(expected);
  });

  it('produces different signatures for different secrets', () => {
    const body = '{"hello":"world"}';
    const ts = '1000';
    const a = signWebhookPayload('secret-a', ts, body);
    const b = signWebhookPayload('secret-b', ts, body);
    expect(a).not.toBe(b);
  });

  it('produces different signatures for different timestamps', () => {
    const secret = 'shared-secret';
    const body = '{}';
    expect(signWebhookPayload(secret, '1', body)).not.toBe(
      signWebhookPayload(secret, '2', body),
    );
  });
});

// ---------------------------------------------------------------------------
// deliver.ts
// ---------------------------------------------------------------------------
const subscription = {
  _id: { toString: () => 'sub-1' } as any,
  url: 'https://consumer.example.com/hook',
  secret: 'delivery-secret',
};

const payload = {
  type: 'content.published',
  siteId: 'site-1',
  contentType: 'post',
  slug: 'hello',
  id: 'post-1',
  at: '2026-09-03T10:00:00.000Z',
};

describe('deliverSubscriptionWebhook', () => {
  it('signs body with the same format as the site-level webhook', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));
    const now = new Date('2026-09-03T10:00:00.000Z');
    await deliverSubscriptionWebhook(subscription, payload, {
      fetch,
      sleep: vi.fn(),
      now: () => now,
      warn: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = fetch.mock.calls[0];
    const rawBody = String(init.body);
    expect(JSON.parse(rawBody)).toMatchObject({ type: 'content.published', siteId: 'site-1' });
    const timestamp = String(Math.floor(now.getTime() / 1_000));
    const expectedSig = `sha256=${createHmac('sha256', subscription.secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')}`;
    expect(init.headers['X-CMS-Signature']).toBe(expectedSig);
    expect(init.headers['X-CMS-Event']).toBe('content.published');
    expect(init.headers['X-CMS-Timestamp']).toBe(timestamp);
    expect(SUBSCRIPTION_TIMEOUT_MS).toBe(5_000);
  });

  it('retries once on non-2xx and returns success on second attempt', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await deliverSubscriptionWebhook(subscription, payload, {
      fetch,
      sleep,
      now: () => new Date(),
      warn: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(SUBSCRIPTION_RETRY_DELAY_MS);
    expect(result).toEqual({ status: 'success', statusCode: 204 });
  });

  it('returns failed result (never throws) after two network failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const warn = vi.fn();
    const result = await deliverSubscriptionWebhook(subscription, payload, {
      fetch,
      sleep: vi.fn().mockResolvedValue(undefined),
      now: () => new Date(),
      warn,
    });
    expect(result.status).toBe('failed');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  it('reports the HTTP status code on failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));
    const result = await deliverSubscriptionWebhook(subscription, payload, {
      fetch,
      sleep: vi.fn().mockResolvedValue(undefined),
      now: () => new Date(),
      warn: vi.fn(),
    });
    expect(result).toEqual({ status: 'failed', statusCode: 429 });
  });
});

// ---------------------------------------------------------------------------
// dispatch.ts — scheduling behaviour (DB calls are mocked)
// ---------------------------------------------------------------------------
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const mockFind = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }),
);
vi.mock('@/models/WebhookSubscription', () => ({
  default: {
    find: mockFind,
    updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) }),
  },
}));

describe('dispatchSubscriptionWebhooks', () => {
  beforeEach(() => after.mockReset());

  it('registers delivery with Next after() instead of starting an untracked promise', () => {
    dispatchSubscriptionWebhooks('site-1', {
      type: 'content.published',
      contentType: 'post',
      slug: 'test',
      id: 'abc',
    });
    expect(after).toHaveBeenCalledOnce();
    expect(after.mock.calls[0][0]).toBeTypeOf('function');
  });

  it('keeps a saved mutation successful when scheduling fails', () => {
    after.mockImplementationOnce(() => {
      throw new Error('missing request context');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() =>
        dispatchSubscriptionWebhooks('site-1', {
          type: 'content.published',
          contentType: 'post',
          slug: 'test',
          id: 'abc',
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith('[cms] subscription webhook scheduling failed');
    } finally {
      warn.mockRestore();
    }
  });
});
