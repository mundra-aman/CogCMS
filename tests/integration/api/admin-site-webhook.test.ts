import { describe, expect, it } from 'vitest';
import { GET as getSite, PUT as updateSite } from '@/app/api/admin/sites/[siteId]/route';
import { POST as regenerateSecret } from '@/app/api/admin/sites/[siteId]/webhook-secret/route';
import Site from '@/models/Site';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

describe('admin site webhook settings', () => {
  it('validates the URL and discloses a regenerated secret exactly once', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };
    const invalid = await updateSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}`, {
        user: admin,
        method: 'PUT',
        json: { webhookUrl: 'ftp://bad.example.com' },
      }),
      context,
    );
    expect(invalid.status).toBe(400);

    const updated = await updateSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}`, {
        user: admin,
        method: 'PUT',
        json: { webhookUrl: 'https://consumer.example.com/api/cms-webhook' },
      }),
      context,
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).webhookUrl).toBe('https://consumer.example.com/api/cms-webhook');

    const generated = await regenerateSecret(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${site._id}/webhook-secret`,
        {
          user: admin,
          method: 'POST',
          json: {},
        },
      ),
      context,
    );
    expect(generated.status).toBe(201);
    const body = await generated.json();
    expect(body.secret).toMatch(/^[A-Za-z\d_-]{43}$/);
    const stored = await Site.findById(site._id).select('+webhookSecret').exec();
    expect(stored?.webhookSecret).toBe(body.secret);

    const read = await getSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}`, {
        user: admin,
      }),
      context,
    );
    const readBody = await read.json();
    expect(readBody).not.toHaveProperty('webhookSecret');
    expect(readBody).not.toHaveProperty('secret');
  });
});
