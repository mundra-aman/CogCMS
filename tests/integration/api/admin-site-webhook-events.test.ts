import { describe, expect, it, vi } from 'vitest';
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/webhook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhook')>()),
  notifySiteWebhook: notify,
}));
import { PUT } from '@/app/api/admin/sites/[siteId]/route';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';
import Site from '@/models/Site';

describe('site-wide content invalidation', () => {
  it('notifies after a successful archive and never for a rejected update', async () => {
    notify.mockReset();
    const site = await createTestSite();
    const siteId = site._id.toString();
    const user = await createTestUser();
    const context = { params: Promise.resolve({ siteId }) };
    const response = await PUT(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${siteId}`, {
        user,
        method: 'PUT',
        json: { status: 'archived' },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect((await Site.findById(siteId))?.status).toBe('archived');
    expect(notify).toHaveBeenCalledWith(siteId, {
      type: 'content.updated',
      contentType: 'site',
      slug: site.slug,
      id: siteId,
    });
    notify.mockReset();
    const invalid = await PUT(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${siteId}`, {
        user,
        method: 'PUT',
        json: { status: 'invalid' },
      }),
      context,
    );
    expect(invalid.status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });
});
