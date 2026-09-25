import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require';
import { HttpError } from '@/lib/http/errors';
import { getAccessibleSites, getCurrentSite } from '@/lib/site/context';
import { AdminShell } from '@/components/admin/admin-shell';
import { SiteProvider } from '@/components/admin/site-provider';

async function authenticatedUser() {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof HttpError && error.code === 'UNAUTHORIZED') redirect('/admin/login');
    throw error;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await authenticatedUser();
  const sites = await getAccessibleSites(user);
  let currentSite = null;
  try {
    currentSite = await getCurrentSite(user);
  } catch (error) {
    if (!(error instanceof HttpError && error.code === 'SITE_FORBIDDEN')) throw error;
  }

  return (
    <AdminShell user={user} sites={sites} currentSite={currentSite}>
      <SiteProvider key={currentSite?.id ?? 'no-site'} site={currentSite}>
        {children}
      </SiteProvider>
    </AdminShell>
  );
}
