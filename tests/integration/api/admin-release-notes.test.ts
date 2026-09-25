import { describe, expect, it } from 'vitest';
import { GET as listNotes, POST as createNote } from '@/app/api/admin/release-notes/route';
import { GET as getNote, PUT as updateNote } from '@/app/api/admin/release-notes/[slug]/route';
import ReleaseNote from '@/models/ReleaseNote';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };

describe('admin release notes', () => {
  it('round-trips bodyMarkdown, refreshes the snapshot, and preserves first publish time', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const request = (path: string, method = 'GET', json?: unknown) =>
      authenticatedRequest(`http://localhost:3003/api/admin/release-notes${path}`, {
        user: admin,
        siteId: site._id.toString(),
        method,
        json,
      });
    const original = 'Intro line.\n\n## Added\n\n- First item\n';

    const createdResponse = await createNote(
      await request('', 'POST', {
        version: '4.0',
        date: '2026-09-03',
        bodyMarkdown: original,
        status: 'draft',
      }),
      rootContext,
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      slug: 'v4-0',
      bodyMarkdown: original,
      status: 'draft',
      intro: ['Intro line.'],
    });
    expect(created.createdBy).toBe(admin._id.toString());
    expect(created.updatedBy).toBe(admin._id.toString());
    expect(created.publishedAt).toBeNull();

    const loaded = await (
      await getNote(await request('/v4-0'), { params: Promise.resolve({ slug: 'v4-0' }) })
    ).json();
    expect(loaded.bodyMarkdown).toBe(original);

    const changed = 'Changed intro.\n\n## Fixed\n\n1. Stable snapshots\n';
    const published = await (
      await updateNote(
        await request('/v4-0', 'PUT', { bodyMarkdown: changed, status: 'publish' }),
        { params: Promise.resolve({ slug: 'v4-0' }) },
      )
    ).json();
    expect(published.bodyMarkdown).toBe(changed);
    expect(published.intro).toEqual(['Changed intro.']);
    expect(published.sections[0]).toMatchObject({ title: 'Fixed' });
    expect(published.updatedBy).toBe(admin._id.toString());
    const firstPublishedAt = published.publishedAt;
    expect(firstPublishedAt).toBeTruthy();

    await updateNote(await request('/v4-0', 'PUT', { status: 'draft' }), {
      params: Promise.resolve({ slug: 'v4-0' }),
    });
    const republished = await (
      await updateNote(await request('/v4-0', 'PUT', { status: 'publish' }), {
        params: Promise.resolve({ slug: 'v4-0' }),
      })
    ).json();
    expect(republished.publishedAt).toBe(firstPublishedAt);
    expect(await ReleaseNote.countDocuments({ siteId: site._id })).toBe(1);
  });

  it('allows the same derived slug on two sites and isolates list/item reads', async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    for (const site of [siteA, siteB]) {
      const response = await createNote(
        await authenticatedRequest('http://localhost:3003/api/admin/release-notes', {
          user: admin,
          siteId: site._id.toString(),
          method: 'POST',
          json: {
            version: '3.8',
            date: '2026-08-01',
            bodyMarkdown: `Site ${site.slug}`,
          },
        }),
        rootContext,
      );
      expect(response.status).toBe(201);
    }

    const list = await listNotes(
      await authenticatedRequest('http://localhost:3003/api/admin/release-notes', {
        user: admin,
        siteId: siteA._id.toString(),
      }),
      rootContext,
    );
    expect(await list.json()).toHaveLength(1);

    const wrongSite = await getNote(
      await authenticatedRequest('http://localhost:3003/api/admin/release-notes/v3-8', {
        user: admin,
        siteId: siteA._id.toString(),
      }),
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    expect(wrongSite.status).toBe(404);
  });
});
