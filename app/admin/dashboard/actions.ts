'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { requireSiteAccess, requireUser } from '@/lib/auth/require';
import { logoutAction } from '@/app/admin/login/actions';
import { SITE_COOKIE, siteCookieOptions } from '@/lib/site/context';
import Site from '@/models/Site';

export async function setCurrentSiteAction(
  siteId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
      return { success: false, error: 'Invalid site selection.' };
    }
    const canonicalSiteId = new Types.ObjectId(siteId).toString();
    const user = await requireUser();
    requireSiteAccess(user, canonicalSiteId);
    await connectToDatabase();
    const site = await Site.findOne({ _id: canonicalSiteId, status: 'active' })
      .select('_id')
      .lean()
      .exec();
    if (!site) return { success: false, error: 'That site is not active.' };
    (await cookies()).set(SITE_COOKIE, canonicalSiteId, siteCookieOptions());
    revalidatePath('/admin/dashboard', 'layout');
    return { success: true };
  } catch {
    return { success: false, error: 'You do not have access to that site.' };
  }
}

export async function logoutFromDashboardAction(): Promise<never> {
  await logoutAction();
  redirect('/admin/login');
}
