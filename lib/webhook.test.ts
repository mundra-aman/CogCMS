import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const after = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after,
}));
import {
  deliveryEventType,
  deliverSiteWebhook,
  WEBHOOK_RETRY_DELAY_MS,
  WEBHOOK_TIMEOUT_MS,
  notifySiteWebhook,
} from '@/lib/webhook';

const site = {
  id: 'site-1',
  webhookUrl: 'https://consumer.example.com/api/cms-webhook',
  webhookSecret: 'secret-value',
};
const event = {
  contentType: 'post' as const,
  slug: 'hello',
  id: 'post-1',
  type: 'content.published' as const,
};

describe('site webhooks', () => {
  beforeEach(() => after.mockReset());

  it('registers post-response delivery with Next instead of starting an untracked task', () => {
    notifySiteWebhook('0123456789abcdef01234567', event);
    expect(after).toHaveBeenCalledOnce();
    expect(after.mock.calls[0][0]).toBeTypeOf('function');
  });

  it('keeps a saved mutation successful when scheduling fails', () => {
    after.mockImplementationOnce(() => {
      throw new Error('missing request context');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => notifySiteWebhook('0123456789abcdef01234567', event)).not.toThrow();
      expect(warn).toHaveBeenCalledWith('[cms] webhook scheduling failed');
    } finally {
      warn.mockRestore();
    }
  });

  it('signs the exact raw body and retries once after two seconds', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await deliverSiteWebhook(site, event, {
      fetch,
      sleep,
      now: () => new Date('2026-09-03T10:00:00.000Z'),
      warn: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(WEBHOOK_RETRY_DELAY_MS);
    const [, init] = fetch.mock.calls[0];
    const rawBody = String(init.body);
    expect(JSON.parse(rawBody)).toEqual({
      type: 'content.published',
      siteId: 'site-1',
      contentType: 'post',
      slug: 'hello',
      id: 'post-1',
      at: '2026-09-03T10:00:00.000Z',
    });
    expect(init.headers['X-CMS-Event']).toBe('content.published');
    expect(init.headers['X-CMS-Timestamp']).toBe('1788429600');
    expect(init.headers['X-CMS-Signature']).toBe(
      `sha256=${createHmac('sha256', site.webhookSecret)
        .update(`1788429600.${rawBody}`)
        .digest('hex')}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(WEBHOOK_TIMEOUT_MS).toBe(5_000);
    expect(fetch.mock.calls[1][1].body).toBe(rawBody);
  });

  it('warns and resolves after two failures so saves are never failed by delivery', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const warn = vi.fn();
    await expect(
      deliverSiteWebhook(site, event, { fetch, sleep: vi.fn(), now: () => new Date(), warn }),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('maps publication transitions to stable event names', () => {
    expect(deliveryEventType('draft', 'publish')).toBe('content.published');
    expect(deliveryEventType('publish', 'publish')).toBe('content.updated');
    expect(deliveryEventType('publish', 'draft')).toBe('content.unpublished');
    expect(deliveryEventType('draft', 'draft')).toBeNull();
  });
});
