import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/lib/auth/require';
import type { ResolvedSite } from '@/lib/site/context';
import { logoutFromDashboardAction } from '@/app/admin/dashboard/actions';
import { SiteSwitcher } from './site-switcher';
import { ChangePasswordForm } from './change-password-form';
import { AdminNavigation } from './admin-navigation';
import { CmsBrand } from './cms-brand';

export function AdminShell({
  user,
  sites,
  currentSite,
  children,
}: {
  user: AuthenticatedUser;
  sites: ResolvedSite[];
  currentSite: ResolvedSite | null;
  children: ReactNode;
}) {
  return (
    <div className="cms-workspace min-h-[100dvh] bg-stone-50 text-stone-950 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#cms-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <aside className="border-b border-stone-200 bg-white lg:sticky lg:top-0 lg:h-[100dvh] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-6 p-4 sm:p-5">
          <div className="flex items-center justify-between lg:block">
            <Link href="/admin/dashboard" className="flex items-center gap-3">
              <CmsBrand />
            </Link>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium capitalize text-stone-600 lg:hidden">
              {user.role}
            </span>
          </div>

          <SiteSwitcher sites={sites} currentSite={currentSite} />

          <AdminNavigation isAdmin={user.role === 'admin'} hasSite={Boolean(currentSite)}>
            <div className="mt-6 border-t border-stone-200 pt-4 lg:mt-auto">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
              <ChangePasswordForm />
              <form action={logoutFromDashboardAction} className="mt-3">
                <button className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:translate-y-px">
                  Sign out
                </button>
              </form>
            </div>
          </AdminNavigation>
        </div>
      </aside>
      <main id="cms-main" tabIndex={-1} className="min-w-0">
        {children}
      </main>
    </div>
  );
}
