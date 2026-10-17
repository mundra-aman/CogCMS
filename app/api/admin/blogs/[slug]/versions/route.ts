import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import BlogVersion from '@/models/BlogVersion';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export const GET = withAdmin<Params>(async (_req, { params, site }) => {
  const { slug } = await params;
  await connectToDatabase();

  const blog = await Blog.findOne({ slug, siteId: site.id }).select({ _id: 1 }).lean().exec();
  if (!blog) throw notFound('Blog');

  const versions = await BlogVersion.find({ blogId: blog._id, siteId: site.id })
    .sort({ version: -1 })
    .select({
      version: 1,
      changeType: 1,
      'snapshot.title': 1,
      'snapshot.slug': 1,
      'snapshot.status': 1,
      createdBy: 1,
      createdAt: 1,
    })
    .lean()
    .exec();

  return NextResponse.json(
    versions.map((version) => ({
      id: version._id.toString(),
      version: version.version,
      changeType: version.changeType,
      title: version.snapshot.title,
      slug: version.snapshot.slug,
      status: version.snapshot.status,
      createdBy: version.createdBy?.toString() ?? null,
      createdAt: version.createdAt,
    })),
  );
});
