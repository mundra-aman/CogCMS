import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { serializeUser } from '@/lib/admin/serializers';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { getAccessibleSites, getCurrentSite } from '@/lib/site/context';
import { changePasswordSchema } from '@/lib/validation/user';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async (req, { user }) => {
    await connectToDatabase();
    const document = await User.findById(user.id).exec();
    if (!document) throw validationError(null, 'Session user no longer exists');
    const [sites, currentSite] = await Promise.all([
      getAccessibleSites(user),
      getCurrentSite(user, req),
    ]);
    return NextResponse.json({ user: serializeUser(document), sites, currentSite });
  },
  { site: false },
);

export const PUT = withAdmin(
  async (req, { user }) => {
    const parsed = changePasswordSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();
    const document = await User.findById(user.id).select('+passwordHash').exec();
    if (!document) throw validationError(null, 'Session user no longer exists');
    if (!(await verifyPassword(parsed.data.currentPassword, document.passwordHash))) {
      throw validationError(null, 'Current password is incorrect');
    }
    document.passwordHash = await hashPassword(parsed.data.newPassword);
    await document.save();
    return NextResponse.json({ success: true });
  },
  { site: false },
);
