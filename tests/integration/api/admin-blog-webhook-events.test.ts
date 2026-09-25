import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifySiteWebhook = vi.hoisted(() => vi.fn());
vi.mock('@/lib/webhook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhook')>()),
  notifySiteWebhook,
}));

import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { DELETE as deleteBlog, PUT as updateBlog } from '@/app/api/admin/blogs/[slug]/route';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };
const payload = {
  title: 'Webhook post',
  slug: 'webhook-post',
  content: '<p>Body</p>',
  status: 'publish' as const,
};

describe('blog webhook events', () => {
  beforeEach(() => notifySiteWebhook.mockReset());

  it('dispatches publish, update, unpublish, and public delete transitions', async () => {
    const site = await createTestSite();
    const user = await createTestUser({ siteIds: [site._id.toString()] });
    const created = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user,
        siteId: site._id.toString(),
        method: 'POST',
        json: payload,
      }),
      rootContext,
    );
    const body = await created.json();
    expect(notifySiteWebhook).toHaveBeenLastCalledWith(
      site._id.toString(),
      expect.objectContaining({
        type: 'content.published',
        contentType: 'post',
        slug: 'webhook-post',
        id: body._id,
      }),
    );

    const context = { params: Promise.resolve({ slug: 'webhook-post' }) };
    await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/webhook-post', {
        user,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { title: 'Updated' },
      }),
      context,
    );
    expect(notifySiteWebhook).toHaveBeenLastCalledWith(
      site._id.toString(),
      expect.objectContaining({ type: 'content.updated' }),
    );

    await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/webhook-post', {
        user,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      }),
      context,
    );
    expect(notifySiteWebhook).toHaveBeenLastCalledWith(
      site._id.toString(),
      expect.objectContaining({ type: 'content.unpublished' }),
    );

    await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/webhook-post', {
        user,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      }),
      context,
    );
    await deleteBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/webhook-post', {
        user,
        siteId: site._id.toString(),
        method: 'DELETE',
        json: {},
      }),
      context,
    );
    expect(notifySiteWebhook).toHaveBeenLastCalledWith(
      site._id.toString(),
      expect.objectContaining({ type: 'content.deleted' }),
    );
  });
});
