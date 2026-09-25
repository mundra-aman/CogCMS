import { describe, expect, it } from 'vitest';
import { GET as listAuthors, POST as createAuthor } from '@/app/api/admin/authors/route';
import { GET as getAuthor } from '@/app/api/admin/authors/[slug]/route';
import { GET as listFaqs, POST as createFaq } from '@/app/api/admin/faqs/route';
import { PUT as updateFaq } from '@/app/api/admin/faqs/[id]/route';
import { GET as listSubmissions } from '@/app/api/admin/faq-submissions/route';
import { PATCH as updateSubmission } from '@/app/api/admin/faq-submissions/[id]/route';
import {
  GET as listWhitepapers,
  POST as createWhitepaper,
} from '@/app/api/admin/whitepapers/route';
import { GET as getWhitepaper } from '@/app/api/admin/whitepapers/[slug]/route';
import FAQSubmission from '@/models/FAQSubmission';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };

describe('tenant isolation across Phase B content handlers', () => {
  it('scopes authors, FAQs, submissions, and whitepapers to the selected site', async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    const request = (path: string, siteId: string, method = 'GET', json?: unknown) =>
      authenticatedRequest(`http://localhost:3003/api/admin/${path}`, {
        user: admin,
        siteId,
        method,
        json,
      });

    for (const site of [siteA, siteB]) {
      expect(
        (
          await createAuthor(
            await request('authors', site._id.toString(), 'POST', {
              name: `Author ${site.slug}`,
              slug: 'shared-author',
            }),
            rootContext,
          )
        ).status,
      ).toBe(201);
      expect(
        (
          await createFaq(
            await request('faqs', site._id.toString(), 'POST', {
              question: `Question ${site.slug}`,
              answer: 'Answer',
            }),
            rootContext,
          )
        ).status,
      ).toBe(201);
      expect(
        (
          await createWhitepaper(
            await request('whitepapers', site._id.toString(), 'POST', {
              title: `Paper ${site.slug}`,
              slug: 'shared-paper',
              description: 'Tenant-safe paper',
              content: 'Body',
            }),
            rootContext,
          )
        ).status,
      ).toBe(201);
      await FAQSubmission.create({
        siteId: site._id,
        question: `Submission ${site.slug}`,
        status: 'pending',
      });
    }

    const listCases = [
      ['authors', listAuthors],
      ['faqs', listFaqs],
      ['faq-submissions', listSubmissions],
      ['whitepapers', listWhitepapers],
    ] as const;
    for (const [path, handler] of listCases) {
      const response = await handler(await request(path, siteA._id.toString()), rootContext);
      const body = await response.json();
      expect(body).toHaveLength(1);
      expect(body[0].siteId).toBe(siteA._id.toString());
    }

    expect(
      (
        await getAuthor(await request('authors/shared-author', siteA._id.toString()), {
          params: Promise.resolve({ slug: 'missing-on-a' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await getWhitepaper(await request('whitepapers/shared-paper', siteA._id.toString()), {
          params: Promise.resolve({ slug: 'missing-on-a' }),
        })
      ).status,
    ).toBe(404);

    const faqB = (
      await (await listFaqs(await request('faqs', siteB._id.toString()), rootContext)).json()
    )[0];
    expect(
      (
        await updateFaq(
          await request(`faqs/${faqB._id}`, siteA._id.toString(), 'PUT', { answer: 'Escape' }),
          { params: Promise.resolve({ id: faqB._id }) },
        )
      ).status,
    ).toBe(404);

    const submissionB = await FAQSubmission.findOne({ siteId: siteB._id }).exec();
    expect(
      (
        await updateSubmission(
          await request(`faq-submissions/${submissionB!._id}`, siteA._id.toString(), 'PATCH', {
            status: 'answered',
          }),
          { params: Promise.resolve({ id: submissionB!._id.toString() }) },
        )
      ).status,
    ).toBe(404);
  });

  it('rejects an editor override for an unassigned site', async () => {
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    const editor = await createTestUser({ role: 'editor', siteIds: [siteA._id.toString()] });
    const response = await listAuthors(
      await authenticatedRequest('http://localhost:3003/api/admin/authors', {
        user: editor,
        siteId: siteB._id.toString(),
      }),
      rootContext,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('SITE_FORBIDDEN');
  });
});
