import { mkdirSync, writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as publish } from '@/app/api/publishing/v1/posts/route';
import { PUT as updateAuthor } from '@/app/api/admin/authors/[slug]/route';
import { PUT as updateBlog } from '@/app/api/admin/blogs/[slug]/route';
import { issueApiKey } from '@/lib/auth/api-key';
import Author from '@/models/Author';
import Blog from '@/models/Blog';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const ctx = { params: Promise.resolve({}) };
const request = (key: string, body: unknown) =>
  new NextRequest('http://localhost:3003/api/publishing/v1/posts', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function fixture() {
  const user = await createTestUser();
  const site = await createTestSite();
  const key = (
    await issueApiKey({
      siteId: site._id,
      name: 'Review regression',
      scopes: ['publishing:write'],
      createdBy: user._id,
    })
  ).plaintext;
  const body = {
    sourceId: 'review-project',
    revision: 'a'.repeat(64),
    title: 'Review article',
    slug: 'review-article',
    content: '<h2>Checked article</h2><p>Supported facts.</p>',
  };
  return { user, site, key, body };
}
function artifact(name: string, value: unknown) {
  mkdirSync('output/cms-publishing/pr20-review', { recursive: true });
  writeFileSync(`output/cms-publishing/pr20-review/${name}.json`, JSON.stringify(value, null, 2));
}
afterEach(() => vi.restoreAllMocks());

describe('PR20 publishing review regressions', () => {
  it('rejects publication with an omitted, unpublished retained author, while explicit null clears it', async () => {
    const { user, site, key, body } = await fixture();
    const author = await Author.create({
      siteId: site._id,
      name: 'Draft author',
      slug: 'draft-author',
      status: 'publish',
    });
    const draft = (
      await (await publish(request(key, { ...body, authorId: author.id }), ctx)).json()
    ).data;
    const change = await authenticatedRequest(
      'http://localhost:3003/api/admin/authors/draft-author',
      {
        user,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      },
    );
    expect(
      (await updateAuthor(change, { params: Promise.resolve({ slug: 'draft-author' }) })).status,
    ).toBe(200);
    const promoted = {
      ...body,
      revision: 'b'.repeat(64),
      status: 'publish',
      expectedUpdatedAt: draft.updatedAt,
    };
    const denied = await publish(request(key, promoted), ctx);
    artifact('retained-author', { expectedStatus: 400, actualStatus: denied.status });
    expect(denied.status).toBe(400);
    const unchanged = await Blog.findById(draft.id).exec();
    expect(unchanged!.status).toBe('draft');
    expect(unchanged!.authorId!.toString()).toBe(author.id);
    const cleared = await publish(request(key, { ...promoted, authorId: null }), ctx);
    expect(cleared.status).toBe(200);
    const live = (await cleared.json()).data;
    expect(live.status).toBe('publish');
    expect(live.authorId).toBeNull();
    artifact('retained-author', {
      passed: true,
      unpublishedRetainedDenied: true,
      explicitNullCleared: true,
    });
  });

  it('retains and validates a published author when the update omits authorId', async () => {
    const { site, key, body } = await fixture();
    const author = await Author.create({
      siteId: site._id,
      name: 'Published author',
      slug: 'published-author',
      status: 'publish',
    });
    const draft = (
      await (await publish(request(key, { ...body, authorId: author.id }), ctx)).json()
    ).data;
    const result = await publish(
      request(key, {
        ...body,
        revision: 'b'.repeat(64),
        status: 'publish',
        expectedUpdatedAt: draft.updatedAt,
      }),
      ctx,
    );
    expect(result.status).toBe(200);
    expect((await result.json()).data.authorId).toBe(author.id);
    artifact('published-author', { passed: true, omittedAuthorRetained: true });
  });

  it.each([true, false])(
    'handles concurrent source updates (same revision: %s)',
    async (sameRevision) => {
      const { site, key, body } = await fixture();
      const draft = (await (await publish(request(key, body), ctx)).json()).data;
      let arrivals = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = Blog.findOneAndUpdate.bind(Blog) as (...args: any[]) => any;
      const spy = vi.spyOn(Blog, 'findOneAndUpdate').mockImplementation(((...args: any[]) => {
        const query = original(...args);
        const exec = query.exec.bind(query);
        query.exec = async () => {
          arrivals++;
          if (arrivals === 2) release();
          await gate;
          return exec();
        };
        return query;
      }) as any);
      let responses;
      try {
        const first = { ...body, revision: 'b'.repeat(64), expectedUpdatedAt: draft.updatedAt };
        responses = await Promise.all([
          publish(request(key, first), ctx),
          publish(
            request(key, { ...first, revision: sameRevision ? first.revision : 'c'.repeat(64) }),
            ctx,
          ),
        ]);
      } finally {
        spy.mockRestore();
      }
      const statuses = responses.map((r) => r.status).sort();
      artifact(sameRevision ? 'matching-race' : 'different-race', { statuses, arrivals });
      expect(arrivals).toBe(2);
      expect(statuses).toEqual(sameRevision ? [200, 200] : [200, 409]);
      expect(await Blog.countDocuments({ siteId: site._id })).toBe(1);
      const winner = await Blog.findById(draft.id).exec();
      if (sameRevision) {
        const replies = await Promise.all(responses.map((r) => r.json()));
        expect(replies.map((r) => r.replayed).sort()).toEqual([false, true]);
        expect(winner!.studioRevision).toBe('b'.repeat(64));
      } else {
        const accepted = await responses.find((r) => r.status === 200)!.json();
        expect(winner!.studioRevision).toBe(accepted.data.sourceRevision);
      }
      artifact(sameRevision ? 'matching-race' : 'different-race', {
        passed: true,
        statuses,
        arrivals,
        sourceRecords: 1,
      });
    },
  );

  it('reports a CMS editor save after a Studio delivery until Studio delivers again', async () => {
    const { user, site, key, body } = await fixture();
    const first = (await (await publish(request(key, body), ctx)).json()).data;
    expect(first.editedInCms).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const edit = await authenticatedRequest(
      'http://localhost:3003/api/admin/blogs/review-article',
      { user, siteId: site._id.toString(), method: 'PUT', json: { title: 'Edited in CMS' } },
    );
    expect(
      (await updateBlog(edit, { params: Promise.resolve({ slug: 'review-article' }) })).status,
    ).toBe(200);
    const edited = await Blog.findById(first.id).exec();
    expect(edited!.updatedAt.getTime()).toBeGreaterThan(edited!.studioDeliveredAt!.getTime());
    const again = await publish(
      request(key, {
        ...body,
        revision: 'c'.repeat(64),
        expectedUpdatedAt: edited!.updatedAt.toISOString(),
      }),
      ctx,
    );
    expect(again.status).toBe(200);
    const redelivered = (await again.json()).data;
    expect(redelivered.editedInCms).toBe(false);
    expect(redelivered.title).toBe('Review article');
  });
});
