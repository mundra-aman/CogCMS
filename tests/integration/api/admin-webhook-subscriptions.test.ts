import { describe, expect, it, vi, beforeEach } from 'vitest';

// Prevent real after() calls in integration tests; dispatchSubscriptionWebhooks
// is not under test here — only the HTTP layer and secret handling are.
const after = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after,
}));

import {
  GET as listSubscriptions,
  POST as createSubscription,
} from '@/app/api/admin/sites/[siteId]/webhook-subscriptions/route';
import {
  PATCH as updateSubscription,
  DELETE as deleteSubscription,
} from '@/app/api/admin/sites/[siteId]/webhook-subscriptions/[subscriptionId]/route';
import WebhookSubscription from '@/models/WebhookSubscription';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

describe('admin webhook subscription CRUD', () => {
  beforeEach(() => after.mockReset());

  it('creates a subscription and returns secret exactly once, lists without secret', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };

    const created = await createSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions`,
        {
          user: admin,
          method: 'POST',
          json: {
            url: 'https://consumer.example.com/hook',
            events: ['content.published', 'content.updated'],
          },
        },
      ),
      context,
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    // Secret is returned once on creation.
    expect(body.secret).toMatch(/^[A-Za-z\d_-]{43}$/);
    expect(body.subscription).toMatchObject({
      url: 'https://consumer.example.com/hook',
      events: expect.arrayContaining(['content.published', 'content.updated']),
      active: true,
    });
    // Secret must not be present on the subscription object.
    expect(body.subscription).not.toHaveProperty('secret');

    // List should not expose secret.
    const listed = await listSubscriptions(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions`,
        { user: admin },
      ),
      context,
    );
    expect(listed.status).toBe(200);
    const listBody = await listed.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0]).not.toHaveProperty('secret');

    // Verify secret is stored and not leaked via direct model query (select: false).
    const stored = await WebhookSubscription.findById(body.subscription._id)
      .select('+secret')
      .exec();
    expect(stored?.secret).toBe(body.secret);
    expect(stored?.secret).not.toBeUndefined();
  });

  it('rejects invalid URLs, missing events, and non-https URLs', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };

    const cases = [
      { url: 'not-a-url', events: ['content.published'] },
      { url: 'http://insecure.example.com/hook', events: ['content.published'] },
      { url: 'https://consumer.example.com/hook', events: [] },
      { url: 'https://consumer.example.com/hook', events: ['invalid.event'] },
    ];

    for (const json of cases) {
      const response = await createSubscription(
        await authenticatedRequest(
          `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions`,
          { user: admin, method: 'POST', json },
        ),
        context,
      );
      expect(response.status, `expected 400 for ${JSON.stringify(json)}`).toBe(400);
    }
  });

  it('updates url and active, blocks cross-site access', async () => {
    const admin = await createTestUser();
    const siteA = await createTestSite();
    const siteB = await createTestSite();

    const createContext = { params: Promise.resolve({ siteId: siteA._id.toString() }) };
    const created = await createSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${siteA._id}/webhook-subscriptions`,
        {
          user: admin,
          method: 'POST',
          json: { url: 'https://a.example.com/hook', events: ['content.published'] },
        },
      ),
      createContext,
    );
    const { subscription } = await created.json();

    // Toggle active.
    const patchContext = {
      params: Promise.resolve({
        siteId: siteA._id.toString(),
        subscriptionId: subscription._id,
      }),
    };
    const patched = await updateSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${siteA._id}/webhook-subscriptions/${subscription._id}`,
        { user: admin, method: 'PATCH', json: { active: false } },
      ),
      patchContext,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).active).toBe(false);

    // Cross-site access must fail (siteB context for siteA subscription).
    const crossSiteContext = {
      params: Promise.resolve({
        siteId: siteB._id.toString(),
        subscriptionId: subscription._id,
      }),
    };
    const crossSite = await updateSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${siteB._id}/webhook-subscriptions/${subscription._id}`,
        { user: admin, method: 'PATCH', json: { active: true } },
      ),
      crossSiteContext,
    );
    expect(crossSite.status).toBe(404);
  });

  it('deletes a subscription and returns 404 on repeat delete', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const createContext = { params: Promise.resolve({ siteId: site._id.toString() }) };

    const created = await createSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions`,
        {
          user: admin,
          method: 'POST',
          json: { url: 'https://del.example.com/hook', events: ['content.deleted'] },
        },
      ),
      createContext,
    );
    const { subscription } = await created.json();

    const delContext = {
      params: Promise.resolve({
        siteId: site._id.toString(),
        subscriptionId: subscription._id,
      }),
    };
    const deleted = await deleteSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions/${subscription._id}`,
        { user: admin, method: 'DELETE', json: {} },
      ),
      delContext,
    );
    expect(deleted.status).toBe(200);

    const again = await deleteSubscription(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions/${subscription._id}`,
        { user: admin, method: 'DELETE', json: {} },
      ),
      delContext,
    );
    expect(again.status).toBe(404);
  });

  it('rejects editor-role access', async () => {
    const site = await createTestSite();
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };

    const response = await listSubscriptions(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-subscriptions`,
        { user: editor },
      ),
      context,
    );
    expect(response.status).toBe(403);
  });
});
