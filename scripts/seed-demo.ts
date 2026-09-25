import mongoose, { Types } from 'mongoose';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import Site from '@/models/Site';
import User from '@/models/User';
import { getEnv } from '@/lib/env';
import { PIPELINE_VERSION } from '@/lib/render/version';

const DEMO_DB = 'cms_public_demo';

export function assertLocalDemoTarget(uri: string | undefined, databaseName: string | undefined): void {
  if (databaseName !== DEMO_DB || !uri) {
    throw new Error(`Demo seed requires MONGODB_DB_NAME=${DEMO_DB} and a local MongoDB URI.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Demo seed requires a valid local MongoDB URI.');
  }
  if (
    parsed.protocol !== 'mongodb:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port !== '27017' ||
    parsed.pathname !== '/' ||
    [...parsed.searchParams.keys()].some((key) => key !== 'replicaSet') ||
    (parsed.searchParams.has('replicaSet') && parsed.searchParams.get('replicaSet') !== 'rs0')
  ) {
    throw new Error('Demo seed only accepts mongodb://localhost:27017 (or loopback IP) with optional replicaSet=rs0.');
  }
}

export function buildDemoBlogs(siteIds: [Types.ObjectId, Types.ObjectId], adminId: Types.ObjectId) {
  return Array.from({ length: 48 }, (_, index) => {
    const site = index < 30 ? 0 : 1;
    const withinSite = site === 0 ? index : index - 30;
    const status = index % 3 === 0 ? 'draft' : 'publish';
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, Math.floor(index / 2)));
    const title = withinSite % 7 === 0 ? 'Shared title' : `Example article ${withinSite + 1}`;
    return {
      siteId: siteIds[site],
      title,
      slug: `example-${withinSite + 1}`,
      excerpt: 'Fictional sample content for local development.',
      content: '<p>Fictional sample content for local development.</p>',
      tag: withinSite % 5 === 0 ? 'a+b' : withinSite % 2 === 0 ? 'Guides' : 'News',
      status,
      publishedAt: status === 'publish' ? createdAt : null,
      rendered: {
        html: '<p>Fictional sample content for local development.</p>',
        toc: [],
        wordCount: 7,
        readingTime: 1,
        pipelineVersion: PIPELINE_VERSION,
        renderedAt: createdAt,
      },
      createdBy: adminId,
      updatedBy: adminId,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

export async function seedDemo(): Promise<void> {
  const env = getEnv();
  assertLocalDemoTarget(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await connectToDatabase();
  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').exec();
  if (admins.length !== 1 || (await Site.countDocuments({})) !== 0 || (await Blog.countDocuments({})) !== 0) {
    throw new Error('Demo seed requires exactly one active admin and no existing sites or blogs; nothing was changed.');
  }

  await mongoose.connection.transaction(async (session) => {
    const sites = await Site.create(
      [
        { name: 'Northstar Studio', slug: 'northstar-studio', primaryDomain: 'http://localhost:3003', publisher: { name: 'Northstar Studio', url: 'http://localhost:3003', logoUrl: '' }, createdBy: admins[0]._id },
        { name: 'Harbor Notes', slug: 'harbor-notes', primaryDomain: 'http://localhost:3003', publisher: { name: 'Harbor Notes', url: 'http://localhost:3003', logoUrl: '' }, createdBy: admins[0]._id },
      ],
      { session, ordered: true },
    );
    await Blog.insertMany(buildDemoBlogs([sites[0]._id, sites[1]._id], admins[0]._id), { session });
  });
  console.log('Created two fictional sites and 48 fictional blogs.');
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  seedDemo()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
