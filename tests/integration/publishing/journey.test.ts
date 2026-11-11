/** Failure journey written before implementation. Real Mongo + authentication +
 * publishing/admin/public route handlers; no production database or external writes.
 * Covers permission isolation, default draft, sanitization, idempotency, conflicts,
 * editor-origin reverse feed and existing public draft filtering.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET as siteInfo } from '@/app/api/publishing/v1/site/route';
import { GET as feed, POST as publish } from '@/app/api/publishing/v1/posts/route';
import { GET as publicPosts } from '@/app/api/v1/posts/route';
import { POST as adminCreate } from '@/app/api/admin/blogs/route';
import { issueApiKey } from '@/lib/auth/api-key';
import Blog from '@/models/Blog';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const ctx = { params: Promise.resolve({}) };
const request = (key: string, body?: unknown, query = '') => new NextRequest(
  `http://localhost:3003/api/publishing/v1/posts${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('Content Studio ↔ CMS publication journey', () => {
  it('publishes one source once, preserves CMS edits, and exposes editor-created posts only to the site key', async () => {
    const user = await createTestUser();
    const site = await createTestSite();
    const other = await createTestSite();
    const key = (await issueApiKey({ siteId: site._id, name: 'Studio', scopes: ['publishing:write', 'content:read'], createdBy: user._id })).plaintext;
    const read = (await issueApiKey({ siteId: site._id, name: 'Reader', scopes: ['content:read'], createdBy: user._id })).plaintext;
    const otherKey = (await issueApiKey({ siteId: other._id, name: 'Other', scopes: ['publishing:write'], createdBy: user._id })).plaintext;
    const body = { sourceId: 'studio-project-one', revision: 'a'.repeat(64), title: 'A studio blog', slug: 'studio-blog', content: '<script>alert(1)</script><h2>Evidence</h2><p>A supported article.</p>' };
    expect((await publish(request(read, body), ctx)).status).toBe(403);
    expect((await siteInfo(request(key), ctx)).status).toBe(200);
    const draftResponse = await publish(request(key, body), ctx);
    expect(draftResponse.status).toBe(201);
    const draft = (await draftResponse.json()).data;
    expect(draft.status).toBe('draft');
    expect(draft.content).not.toContain('<script');
    expect(draft.renderedHtml).toContain('Evidence');
    expect(draftResponse.headers.get('cache-control')).toBe('no-store');
    expect((await (await publicPosts(request(read), ctx)).json()).data).toHaveLength(0);
    expect((await (await feed(request(otherKey), ctx)).json()).data).toHaveLength(0);
    const replay = await publish(request(key, body), ctx);
    expect((await replay.json()).data.id).toBe(draft.id);
    expect(await Blog.countDocuments({ siteId: site._id })).toBe(1);
    const liveBody = { ...body, revision: 'b'.repeat(64), status: 'publish', expectedUpdatedAt: draft.updatedAt };
    expect((await publish(request(key, { ...liveBody, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }), ctx)).status).toBe(409);
    const live = (await (await publish(request(key, liveBody), ctx)).json()).data;
    expect(live.status).toBe('publish');
    expect(live.canonicalUrl).toContain('/blogs/studio-blog');
    expect((await (await publicPosts(request(read), ctx)).json()).data).toHaveLength(1);
    await Blog.updateOne({ _id: live.id }, { $set: { title: 'Edited in CMS' } });
    expect((await (await publish(request(key, liveBody), ctx)).json()).data.title).toBe('Edited in CMS');
    expect((await publish(request(key, { ...body, revision: 'c'.repeat(64), expectedUpdatedAt: draft.updatedAt }), ctx)).status).toBe(409);
    const editor = await authenticatedRequest('http://localhost:3003/api/admin/blogs', { user, siteId: site._id.toString(), method: 'POST', json: { title: 'Editor origin', slug: 'editor-origin', content: '<p>Created in the editor.</p>', status: 'publish' } });
    expect((await adminCreate(editor, ctx)).status).toBe(201);
    const rows = (await (await feed(request(key), ctx)).json()).data;
    expect(rows).toHaveLength(2);
    expect(rows.find((p: { slug: string }) => p.slug === 'editor-origin').sourceId).toBeNull();
    expect((await publish(request(key, { ...body, sourceId: 'another-source', revision: 'd'.repeat(64) }), ctx)).status).toBe(409);
    mkdirSync('output/cms-publishing', { recursive: true });
    writeFileSync('output/cms-publishing/journey.json', JSON.stringify({ passed: true, scenarios: ['site isolation', 'read-only denial', 'draft filtering', 'sanitization', 'idempotent replay', 'stale edit denial', 'CMS editor feed', 'slug collision'], posts: rows.length }, null, 2));
  });
});
