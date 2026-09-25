import { describe, expect, it } from 'vitest';
import { parseRerenderArgs, rerenderAll } from '@/scripts/rerender-all';
import { PIPELINE_VERSION } from '@/lib/render/version';
import Blog from '@/models/Blog';
import { createTestSite } from '@/tests/setup/factories';

async function createBlog(siteId: string, slug: string) {
  return Blog.create({
    siteId,
    title: slug,
    slug,
    content: `<h2>${slug}</h2><p>Hello world</p>`,
    rendered: {
      html: '<p>old</p>',
      toc: [],
      wordCount: 1,
      readingTime: 1,
      pipelineVersion: PIPELINE_VERSION,
      renderedAt: new Date('2020-01-01T00:00:00Z'),
    },
  });
}

describe('rerender-all', () => {
  it('parses the complete frozen flag set and rejects unknown arguments', () => {
    expect(
      parseRerenderArgs([
        '--site',
        'alpha',
        '--slug',
        'post',
        '--only-stale',
        '--dry-run',
        '--force',
      ]),
    ).toEqual({ site: 'alpha', slug: 'post', onlyStale: true, dryRun: true, force: true });
    expect(() => parseRerenderArgs(['--wat'])).toThrow(/Unknown argument/);
    expect(() => parseRerenderArgs(['--site'])).toThrow(/requires a value/);
  });

  it('dry-runs without writes, then rerenders only stale records within one site', async () => {
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    const [stale, current, otherSite] = await Promise.all([
      createBlog(siteA._id.toString(), 'stale'),
      createBlog(siteA._id.toString(), 'current'),
      createBlog(siteB._id.toString(), 'other'),
    ]);
    await Blog.collection.updateOne(
      { _id: stale._id },
      { $set: { 'rendered.pipelineVersion': 0 } },
    );
    await Blog.collection.updateOne(
      { _id: otherSite._id },
      { $set: { 'rendered.pipelineVersion': 0 } },
    );
    const before = await Blog.findById(stale._id).exec();

    expect(
      await rerenderAll({
        site: siteA.slug,
        onlyStale: true,
        dryRun: true,
        force: false,
      }),
    ).toEqual({ selected: 2, changed: 1, skipped: 1, errors: 0 });
    expect((await Blog.findById(stale._id).exec())!.rendered.renderedAt).toEqual(
      before!.rendered.renderedAt,
    );

    const originalUpdatedAt = before!.updatedAt;
    expect(
      await rerenderAll({
        site: siteA._id.toString(),
        onlyStale: true,
        dryRun: false,
        force: false,
      }),
    ).toEqual({ selected: 2, changed: 1, skipped: 1, errors: 0 });
    const changed = await Blog.findById(stale._id).exec();
    expect(changed!.rendered.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(changed!.rendered.html).toContain('stale');
    expect(changed!.updatedAt).toEqual(originalUpdatedAt);
    expect((await Blog.findById(current._id).exec())!.rendered.html).toBe('<p>old</p>');
    expect((await Blog.findById(otherSite._id).exec())!.rendered.pipelineVersion).toBe(0);
  });

  it('supports slug isolation and force-rerendering a current snapshot', async () => {
    const site = await createTestSite();
    const [target, untouched] = await Promise.all([
      createBlog(site._id.toString(), 'target'),
      createBlog(site._id.toString(), 'untouched'),
    ]);
    expect(
      await rerenderAll({
        slug: 'target',
        onlyStale: true,
        dryRun: false,
        force: true,
      }),
    ).toEqual({ selected: 1, changed: 1, skipped: 0, errors: 0 });
    expect((await Blog.findById(target._id).exec())!.rendered.html).toContain('target');
    expect((await Blog.findById(untouched._id).exec())!.rendered.html).toBe('<p>old</p>');
  });
});
