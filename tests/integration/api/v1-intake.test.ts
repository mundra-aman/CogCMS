import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { POST as submitFaq } from '@/app/api/v1/intake/faq-submissions/route';
import { POST as subscribe } from '@/app/api/v1/intake/newsletter-subscriptions/route';
import FAQSubmission from '@/models/FAQSubmission';
import NewsletterSubscriber from '@/models/NewsletterSubscriber';
import { createTestSite, createTestUser } from '@/tests/setup/factories';
import { issueTestApiKey, publicApiRequest } from '@/tests/setup/public-api';

const rootContext = { params: Promise.resolve({}) };

describe('v1 intake', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('production rejects missing or malformed visitor identity before writing intake or tokens', async () => {
    const user = await createTestUser();
    const site = await createTestSite();
    const key = await issueTestApiKey(site, user, ['intake:write']);
    vi.stubEnv('NODE_ENV', 'production');
    const candidates: Record<string, string>[] = [
      { 'x-forwarded-for': '203.0.113.8' },
      { 'x-cms-visitor-ip': '1.1.1.1, 2.2.2.2' },
    ];
    for (const headers of candidates) {
      const response = await submitFaq(
        publicApiRequest('http://localhost:3003/api/v1/intake/faq-submissions', key, {
          method: 'POST',
          json: { question: 'Spoofed?' },
          headers,
        }),
        rootContext,
      );
      expect(response.status).toBe(503);
    }
    expect(await FAQSubmission.countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('intake_rate_limits').countDocuments()).toBe(0);
  });

  it('requires intake scope and validates FAQ submissions', async () => {
    const user = await createTestUser();
    const site = await createTestSite();
    const readKey = await issueTestApiKey(site, user, ['content:read']);
    const forbidden = await submitFaq(
      publicApiRequest('http://localhost:3003/api/v1/intake/faq-submissions', readKey, {
        method: 'POST',
        json: { question: 'Can I use this?' },
        headers: { 'x-cms-visitor-ip': '203.0.113.1' },
      }),
      rootContext,
    );
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).code).toBe('FORBIDDEN_SCOPE');

    const key = await issueTestApiKey(site, user, ['intake:write']);
    const invalid = await submitFaq(
      publicApiRequest('http://localhost:3003/api/v1/intake/faq-submissions', key, {
        method: 'POST',
        json: { question: '' },
        headers: { 'x-cms-visitor-ip': '203.0.113.1' },
      }),
      rootContext,
    );
    expect(invalid.status).toBe(400);

    const response = await submitFaq(
      publicApiRequest('http://localhost:3003/api/v1/intake/faq-submissions', key, {
        method: 'POST',
        json: { question: '  Can I use this?  ', name: ' Reader ', email: ' Reader@Example.com ' },
        headers: { 'x-cms-visitor-ip': '203.0.113.1' },
      }),
      rootContext,
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      status: 'pending',
      id: expect.any(String),
    });
    const stored = await FAQSubmission.findOne().exec();
    expect(stored).toMatchObject({
      siteId: site._id,
      question: 'Can I use this?',
      name: 'Reader',
      email: 'reader@example.com',
      createdBy: null,
    });
  });

  it('upserts newsletter subscriptions and reports new versus existing', async () => {
    const user = await createTestUser();
    const site = await createTestSite();
    const key = await issueTestApiKey(site, user, ['intake:write']);
    const request = () =>
      publicApiRequest('http://localhost:3003/api/v1/intake/newsletter-subscriptions', key, {
        method: 'POST',
        json: { email: ' Reader@Example.com ', source: 'footer' },
        headers: { 'x-cms-visitor-ip': '203.0.113.2' },
      });
    const first = await subscribe(request(), rootContext);
    const second = await subscribe(request(), rootContext);
    expect(first.status).toBe(201);
    expect((await first.json()).data).toEqual({ subscribed: true, new: true });
    expect(second.status).toBe(200);
    expect((await second.json()).data).toEqual({ subscribed: true, new: false });
    const stored = await NewsletterSubscriber.findOne().exec();
    expect(stored).toMatchObject({ siteId: site._id, email: 'reader@example.com', submitCount: 2 });
  });

  it('returns 429 and Retry-After after the per-IP burst is exhausted', async () => {
    const user = await createTestUser();
    const site = await createTestSite();
    const key = await issueTestApiKey(site, user, ['intake:write']);
    let response: Response | null = null;
    for (let index = 0; index < 31; index += 1) {
      response = await submitFaq(
        publicApiRequest('http://localhost:3003/api/v1/intake/faq-submissions', key, {
          method: 'POST',
          json: { question: `Question ${index}` },
          headers: { 'x-cms-visitor-ip': '203.0.113.3' },
        }),
        rootContext,
      );
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('2');
  });
});
