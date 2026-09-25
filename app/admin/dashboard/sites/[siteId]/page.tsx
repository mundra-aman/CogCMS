'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { AdminSiteView } from '@/lib/admin/serializers';
import { SiteForm } from '@/components/admin/site-form';
import { ApiKeysPanel } from '@/components/admin/api-keys-panel';

export default function EditSitePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = useState<AdminSiteView | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/sites/${siteId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load site');
        setSite(await response.json());
      })
      .catch(() => setError(true));
  }, [siteId]);

  return (
    <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Edit site</h1>
      <p className="mt-2 mb-8 text-sm text-stone-600">
        Changes affect site selection and future public contracts.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          The site could not be loaded.
        </p>
      ) : null}
      {!error && !site ? <p className="text-sm text-stone-500">Loading site...</p> : null}
      {site ? (
        <>
          <SiteForm site={site} />
          <ApiKeysPanel siteId={site.id} />
        </>
      ) : null}
    </section>
  );
}
