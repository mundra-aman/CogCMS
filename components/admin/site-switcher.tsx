'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ResolvedSite } from '@/lib/site/context';
import { setCurrentSiteAction } from '@/app/admin/dashboard/actions';

export function SiteSwitcher({
  sites,
  currentSite,
}: {
  sites: ResolvedSite[];
  currentSite: ResolvedSite | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sites.length === 0) {
    return <p className="text-xs leading-5 text-stone-500">No active sites yet.</p>;
  }

  return (
    <div className="space-y-2">
      <label htmlFor="cms-site-switcher" className="block text-xs font-medium text-stone-600">
        Working site
      </label>
      <select
        id="cms-site-switcher"
        value={currentSite?.id ?? ''}
        disabled={pending}
        onChange={(event) => {
          const siteId = event.target.value;
          setError(null);
          startTransition(async () => {
            const result = await setCurrentSiteAction(siteId);
            if (!result.success) setError(result.error);
            else router.refresh();
          });
        }}
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
      >
        <option value="" disabled>
          Select a site
        </option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      {currentSite ? (
        <p className="break-all text-xs leading-5 text-stone-600">
          {new URL(currentSite.primaryDomain).host}
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="text-xs text-stone-600">
          Switching site…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
