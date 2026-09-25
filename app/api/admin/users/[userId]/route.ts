import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { hashPassword } from '@/lib/auth/password';
import { serializeUser } from '@/lib/admin/serializers';
import { assertActiveSiteAssignments, assertAdminContinuity } from '@/lib/admin/user-policy';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { updateUserSchema, userAssignmentSchema } from '@/lib/validation/user';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

function assertUserId(userId: string): void {
  if (!/^[a-f\d]{24}$/i.test(userId) || !Types.ObjectId.isValid(userId)) {
    throw validationError({ userId }, 'Invalid user id');
  }
}

export const GET = withAdmin<{ userId: string }>(
  async (_req, { params }) => {
    const { userId } = await params;
    assertUserId(userId);
    await connectToDatabase();
    const user = await User.findById(userId).exec();
    if (!user) throw notFound('User');
    return NextResponse.json(serializeUser(user));
  },
  { admin: true, site: false },
);

export const PUT = withAdmin<{ userId: string }>(
  async (req, { params }) => {
    const { userId } = await params;
    assertUserId(userId);
    const parsed = updateUserSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();

    const target = await User.findById(userId).select('+passwordHash').exec();
    if (!target) throw notFound('User');
    const nextRole = parsed.data.role ?? target.role;
    const nextSiteIds = parsed.data.siteIds ?? target.siteIds.map(String);
    const assignment = userAssignmentSchema.safeParse({ role: nextRole, siteIds: nextSiteIds });
    if (!assignment.success) throw validationError(assignment.error.flatten());
    await assertActiveSiteAssignments(nextSiteIds);
    await assertAdminContinuity(target, {
      role: nextRole,
      status: parsed.data.status ?? target.status,
    });

    const { password, ...updates } = parsed.data;
    target.set(updates);
    if (password) target.passwordHash = await hashPassword(password);
    await target.save();
    return NextResponse.json(serializeUser(target));
  },
  { admin: true, site: false },
);
