import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { hashPassword } from '@/lib/auth/password';
import { serializeUser } from '@/lib/admin/serializers';
import { assertActiveSiteAssignments } from '@/lib/admin/user-policy';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { createUserSchema } from '@/lib/validation/user';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async () => {
    await connectToDatabase();
    const users = await User.find({}).sort({ name: 1, email: 1 }).exec();
    return NextResponse.json(users.map(serializeUser));
  },
  { admin: true, site: false },
);

export const POST = withAdmin(
  async (req, { user }) => {
    const parsed = createUserSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();
    await assertActiveSiteAssignments(parsed.data.siteIds);

    const { password, ...input } = parsed.data;
    const created = await User.create({
      ...input,
      passwordHash: await hashPassword(password),
      createdBy: user.id,
    });
    return NextResponse.json(serializeUser(created), { status: 201 });
  },
  { admin: true, site: false },
);
