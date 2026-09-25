import { describe, expect, it } from 'vitest';
import { GET as listSubscribers } from '@/app/api/admin/newsletter-subscribers/route';
import NewsletterSubscriber from '@/models/NewsletterSubscriber';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };

describe('admin newsletter subscribers', () => {
  it('returns and exports only the selected site with CSV escaping', async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    const subscribedAt = new Date('2026-09-03T09:00:00.000Z');
    await NewsletterSubscriber.create([
      {
        siteId: siteA._id,
        email: 'reader@example.com',
        source: '=2+2,footer',
        submitCount: 2,
        firstSubscribedAt: subscribedAt,
        lastSubscribedAt: subscribedAt,
      },
      {
        siteId: siteB._id,
        email: 'other@example.com',
        firstSubscribedAt: subscribedAt,
        lastSubscribedAt: subscribedAt,
      },
    ]);
    const request = (suffix = '') =>
      authenticatedRequest(`http://localhost:3003/api/admin/newsletter-subscribers${suffix}`, {
        user: admin,
        siteId: siteA._id.toString(),
      });

    const jsonResponse = await listSubscribers(await request(), rootContext);
    expect(jsonResponse.status).toBe(200);
    const rows = await jsonResponse.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('reader@example.com');

    const csvResponse = await listSubscribers(await request('?format=csv'), rootContext);
    expect(csvResponse.headers.get('content-type')).toContain('text/csv');
    expect(csvResponse.headers.get('content-disposition')).toContain(
      `${siteA.slug}-subscribers.csv`,
    );
    const csv = await csvResponse.text();
    expect(csv).toContain('email,source,submitCount,firstSubscribedAt,lastSubscribedAt');
    expect(csv).toContain('reader@example.com,"\'=2+2,footer",2');
    expect(csv).not.toContain('other@example.com');
  });
});
