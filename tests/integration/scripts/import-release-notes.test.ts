import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importReleaseNotes } from '@/scripts/import-release-notes';
import ReleaseNote from '@/models/ReleaseNote';
import { createTestSite } from '@/tests/setup/factories';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('release note importer', () => {
  it('imports N Markdown files to N documents and is stable on rerun', async () => {
    const site = await createTestSite({ slug: 'release-import-site' });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-release-notes-'));
    temporaryDirectories.push(directory);
    await Promise.all([
      fs.writeFile(
        path.join(directory, 'version_3.8_20260801.md'),
        '# Release Notes\nVersion 3.8 | August 1, 2026\n\nFirst.\n',
      ),
      fs.writeFile(
        path.join(directory, 'version_3.7_20260717.md'),
        '# Release Notes\nVersion 3.7 | July 17, 2026\n\nSecond.\n',
      ),
    ]);

    const first = await importReleaseNotes({ siteSlug: site.slug, directory });
    expect(first).toMatchObject({ files: 2, created: 2, updated: 0, total: 2 });
    const firstRows = await ReleaseNote.find({ siteId: site._id }).sort({ slug: 1 }).lean().exec();
    expect(firstRows).toHaveLength(2);
    expect(firstRows.every((row) => row.createdBy === null && row.updatedBy === null)).toBe(true);

    const second = await importReleaseNotes({ siteSlug: site.slug, directory });
    expect(second).toMatchObject({ files: 2, created: 0, updated: 2, total: 2 });
    const secondRows = await ReleaseNote.find({ siteId: site._id }).sort({ slug: 1 }).lean().exec();
    expect(secondRows.map((row) => row._id.toString())).toEqual(
      firstRows.map((row) => row._id.toString()),
    );
  });

  it('rejects malformed archive metadata instead of creating an invalid document', async () => {
    const site = await createTestSite({ slug: 'invalid-release-import-site' });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-release-notes-invalid-'));
    temporaryDirectories.push(directory);
    await fs.writeFile(
      path.join(directory, 'malformed.md'),
      '# Release Notes\nVersion beta | September 3, 2026\n\nInvalid metadata.\n',
    );
    await fs.writeFile(
      path.join(directory, 'version_4.0_20260904.md'),
      '# Release Notes\nVersion 4.0 | September 4, 2026\n\nValid but must not be partly imported.\n',
    );

    await expect(importReleaseNotes({ siteSlug: site.slug, directory })).rejects.toThrow(
      /valid version or date/,
    );
    await expect(ReleaseNote.countDocuments({ siteId: site._id })).resolves.toBe(0);
  });
});
