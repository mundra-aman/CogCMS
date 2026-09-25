import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { serializeSite } from '@/lib/admin/serializers';
import { createSiteSchema } from '@/lib/validation/site';
import Site from '@/models/Site';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async () => {
    await connectToDatabase();
    const sites = await Site.find({}).sort({ name: 1, slug: 1 }).exec();
    return NextResponse.json(sites.map(serializeSite));
  },
  { admin: true, site: false },
);

export const POST = withAdmin(
  async (req, { user }) => {
    const parsed = createSiteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();

    const input = parsed.data;
    const site = await Site.create({
      ...input,
      mediaPrefix: input.mediaPrefix ?? input.slug,
      publisher: input.publisher ?? {
        name: input.name,
        url: input.primaryDomain,
        logoUrl: '',
      },
      createdBy: user.id,
      webhookUrl: input.webhookUrl ?? undefined,
    });
    return NextResponse.json(serializeSite(site), { status: 201 });
  },
  { admin: true, site: false },
);
