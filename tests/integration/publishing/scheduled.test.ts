/** Posts scheduled in the CMS editor: Content Studio lists, moves and publishes them. */
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET as feed, POST as deliver } from '@/app/api/publishing/v1/posts/route';
import { GET as getOne } from '@/app/api/publishing/v1/posts/[id]/route';
import { POST as publish } from '@/app/api/publishing/v1/posts/[id]/publish/route';
import { PUT as reschedule } from '@/app/api/publishing/v1/posts/[id]/schedule/route';
import { POST as adminCreate } from '@/app/api/admin/blogs/route';
import { PUT as adminUpdate } from '@/app/api/admin/blogs/[slug]/route';
import { issueApiKey } from '@/lib/auth/api-key';
import Blog from '@/models/Blog';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const none = { params: Promise.resolve({}) };
const at = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (key: string, path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost:3003/api/publishing/v1/posts${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function setup() {
  const user = await createTestUser();
  const site = await createTestSite();
  const other = await createTestSite();
  const issue = async (siteId: typeof site._id) =>
    (
      await issueApiKey({
        siteId,
        name: 'Studio',
        scopes: ['publishing:write'],
        createdBy: user._id,
      })
    ).plaintext;
  const create = async (slug: string, json: Record<string, unknown>) => {
    const res = await adminCreate(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user,
        siteId: site._id.toString(),
        method: 'POST',
        json: { title: slug, slug, content: '<p>Body.</p>', ...json },
      }),
      none,
    );
    return { status: res.status, body: await res.json() };
  };
  const update = async (slug: string, json: Record<string, unknown>) =>
    adminUpdate(
      await authenticatedRequest(`http://localhost:3003/api/admin/blogs/${slug}`, {
        user,
        siteId: site._id.toString(),
        method: 'PUT',
        json,
      }),
      { params: Promise.resolve({ slug }) },
    );
  return { site, key: await issue(site._id), otherKey: await issue(other._id), create, update };
}

describe('scheduled CMS posts', () => {
  it('stores a schedule only on drafts and lists only scheduled drafts', async () => {
    const { key, create, update } = await setup();
    const when = inHours(5);
    const made = await create('planned', {
      status: 'draft',
      scheduledAt: when,
      scheduleTimezone: 'Asia/Kolkata',
    });
    expect(made.status).toBe(201);
    expect(new Date(made.body.scheduledAt).toISOString()).toBe(when);
    await create('plain-draft', { status: 'draft' });
    const live = await create('live', { status: 'publish', scheduledAt: inHours(3) });
    expect(live.body.scheduledAt).toBeNull();

    const rows = (await (await feed(call(key, '?scheduled=1'), none)).json()).data;
    expect(rows.map((r: { slug: string }) => r.slug)).toEqual(['planned']);
    expect(rows[0]).toMatchObject({ scheduledAt: when, scheduleTimezone: 'Asia/Kolkata' });

    // Saving the draft without schedule fields keeps it; publishing clears it.
    await update('planned', { title: 'Renamed' });
    expect((await Blog.findOne({ slug: 'planned' }))!.scheduledAt?.toISOString()).toBe(when);
    await update('planned', { status: 'publish' });
    expect((await Blog.findOne({ slug: 'planned' }))!.scheduledAt).toBeNull();
  });

  it('refuses a schedule in the past or more than a year out', async () => {
    const { create } = await setup();
    expect((await create('past', { status: 'draft', scheduledAt: inHours(-2) })).status).toBe(400);
    expect((await create('far', { status: 'draft', scheduledAt: inHours(24 * 400) })).status).toBe(
      400,
    );
  });

  it('publishes only at the schedule Content Studio saw, once, for its own site', async () => {
    const { key, otherKey, create } = await setup();
    const when = inHours(1);
    const { body } = await create('go-live', { status: 'draft', scheduledAt: when });
    const id = body._id as string;

    expect((await getOne(call(otherKey, `/${id}`), at(id))).status).toBe(404);
    expect((await publish(call(otherKey, `/${id}/publish`, 'POST', { scheduledAt: when }), at(id))).status).toBe(404);
    expect(
      (await publish(call(key, `/${id}/publish`, 'POST', { scheduledAt: inHours(2) }), at(id)))
        .status,
    ).toBe(409);

    const done = await publish(call(key, `/${id}/publish`, 'POST', { scheduledAt: when }), at(id));
    expect(done.status).toBe(200);
    expect((await done.json()).data).toMatchObject({ status: 'publish', scheduledAt: null });
    const again = await publish(call(key, `/${id}/publish`, 'POST', { scheduledAt: when }), at(id));
    expect((await again.json()).replayed).toBe(true);
    expect((await (await getOne(call(key, `/${id}`), at(id))).json()).data.status).toBe('publish');
  });

  it('moves or clears a draft schedule without counting as a content edit', async () => {
    const { key, create } = await setup();
    const { body } = await create('movable', { status: 'draft', scheduledAt: inHours(4) });
    const id = body._id as string;
    const before = (await Blog.findById(id))!.updatedAt.getTime();
    const later = inHours(30);
    const moved = await reschedule(call(key, `/${id}/schedule`, 'PUT', { scheduledAt: later }), at(id));
    expect(moved.status).toBe(200);
    expect((await moved.json()).data.scheduledAt).toBe(later);
    expect((await Blog.findById(id))!.updatedAt.getTime()).toBe(before);
    const cleared = await reschedule(call(key, `/${id}/schedule`, 'PUT', { scheduledAt: null }), at(id));
    expect((await cleared.json()).data.scheduledAt).toBeNull();

    const live = await create('already-live', { status: 'publish' });
    const liveId = live.body._id as string;
    expect(
      (await reschedule(call(key, `/${liveId}/schedule`, 'PUT', { scheduledAt: later }), at(liveId)))
        .status,
    ).toBe(409);
  });

  it('never schedules a live blog, so scheduling cannot unpublish it', async () => {
    const { create, update } = await setup();
    await create('live-post', { status: 'publish' });
    const res = await update('live-post', { status: 'draft', scheduledAt: inHours(3) });
    expect(res.status).toBe(400);
    expect((await Blog.findOne({ slug: 'live-post' }))!.status).toBe('publish');
  });

  it('publishing a Studio draft on schedule does not mark it edited in the CMS', async () => {
    const { key } = await setup();
    const delivered = await deliver(
      call(key, '', 'POST', {
        sourceId: 'studio-one',
        revision: 'e'.repeat(64),
        title: 'From Studio',
        slug: 'from-studio',
        content: '<p>Body.</p>',
      }),
      none,
    );
    const id = (await delivered.json()).data.id as string;
    const when = inHours(2);
    await reschedule(call(key, `/${id}/schedule`, 'PUT', { scheduledAt: when }), at(id));
    const live = await publish(call(key, `/${id}/publish`, 'POST', { scheduledAt: when }), at(id));
    expect((await live.json()).data).toMatchObject({ status: 'publish', editedInCms: false });
  });
});
