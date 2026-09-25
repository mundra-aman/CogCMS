import mongoose, { Types } from 'mongoose';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import connectToDatabase from '@/lib/mongodb';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { PIPELINE_VERSION } from '@/lib/render/version';
import Blog from '@/models/Blog';
import Site from '@/models/Site';

export interface RerenderOptions {
  site?: string;
  slug?: string;
  onlyStale: boolean;
  dryRun: boolean;
  force: boolean;
}

export interface RerenderResult {
  selected: number;
  changed: number;
  skipped: number;
  errors: number;
}

export function parseRerenderArgs(argv: string[]): RerenderOptions {
  const options: RerenderOptions = { onlyStale: false, dryRun: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only-stale') options.onlyStale = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--site' || arg === '--slug') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--site') options.site = value;
      else options.slug = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function resolveSiteId(selection: string): Promise<Types.ObjectId> {
  const filter =
    /^[a-f\d]{24}$/i.test(selection) && Types.ObjectId.isValid(selection)
      ? { _id: new Types.ObjectId(selection) }
      : { slug: selection };
  const site = await Site.findOne(filter).select({ _id: 1 }).exec();
  if (!site) throw new Error(`Site not found: ${selection}`);
  return site._id;
}

export async function rerenderAll(options: RerenderOptions): Promise<RerenderResult> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (options.site) filter.siteId = await resolveSiteId(options.site);
  if (options.slug) filter.slug = options.slug;

  const blogs = await Blog.find(filter).sort({ siteId: 1, slug: 1 }).exec();
  const result: RerenderResult = { selected: blogs.length, changed: 0, skipped: 0, errors: 0 };
  for (const blog of blogs) {
    if (options.onlyStale && !options.force && blog.rendered.pipelineVersion === PIPELINE_VERSION) {
      result.skipped += 1;
      continue;
    }
    try {
      const rendered = await renderBlogSnapshot(blog.content);
      if (!options.dryRun) {
        await Blog.updateOne(
          { _id: blog._id, siteId: blog.siteId },
          { $set: { rendered } },
          { timestamps: false },
        ).exec();
      }
      result.changed += 1;
    } catch (error) {
      result.errors += 1;
      console.error(`[rerender] ${blog.siteId}/${blog.slug}`, error);
    }
  }
  return result;
}

async function main(): Promise<void> {
  try {
    const result = await rerenderAll(parseRerenderArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (result.errors > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
