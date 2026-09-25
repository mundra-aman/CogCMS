'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminSiteView } from '@/lib/admin/serializers';

const defaults = {
  name: '',
  slug: '',
  primaryDomain: '',
  mediaPrefix: '',
  defaultLocale: 'en',
  status: 'active' as const,
  publisherName: '',
  publisherUrl: '',
  publisherLogoUrl: '',
  blogsPath: '/blogs',
  whitepapersPath: '/whitepapers',
  faqPath: '/faq',
  releaseNotesPath: '/release-notes',
  webhookUrl: '',
};

function fromSite(site?: AdminSiteView) {
  if (!site) return defaults;
  return {
    name: site.name,
    slug: site.slug,
    primaryDomain: site.primaryDomain,
    mediaPrefix: site.mediaPrefix,
    defaultLocale: site.defaultLocale,
    status: site.status,
    publisherName: site.publisher.name,
    publisherUrl: site.publisher.url,
    publisherLogoUrl: site.publisher.logoUrl,
    blogsPath: site.publicPaths.blogs,
    whitepapersPath: site.publicPaths.whitepapers,
    faqPath: site.publicPaths.faq,
    releaseNotesPath: site.publicPaths.releaseNotes,
    webhookUrl: site.webhookUrl ?? '',
  };
}

export function SiteForm({ site }: { site?: AdminSiteView }) {
  const router = useRouter();
  const [form, setForm] = useState(() => fromSite(site));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(site);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const payload = {
            name: form.name,
            slug: form.slug,
            primaryDomain: form.primaryDomain,
            mediaPrefix: form.mediaPrefix || undefined,
            defaultLocale: form.defaultLocale,
            status: form.status,
            publisher: {
              name: form.publisherName || form.name,
              url: form.publisherUrl || form.primaryDomain,
              logoUrl: form.publisherLogoUrl,
            },
            publicPaths: {
              blogs: form.blogsPath,
              whitepapers: form.whitepapersPath,
              faq: form.faqPath,
              releaseNotes: form.releaseNotesPath,
            },
            webhookUrl: form.webhookUrl || null,
          };
          const response = await fetch(
            editing ? `/api/admin/sites/${site!.id}` : '/api/admin/sites',
            {
              method: editing ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            setError(body?.error ?? 'The site could not be saved.');
            return;
          }
          router.push('/admin/dashboard/sites');
          router.refresh();
        });
      }}
    >
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-stone-900">Identity</legend>
        <Field label="Name" required {...field('name')} />
        <Field label="Slug" required helper="Lowercase kebab-case" {...field('slug')} />
        <Field label="Public origin" type="url" required {...field('primaryDomain')} />
        <Field label="Media prefix" helper="Defaults to the site slug" {...field('mediaPrefix')} />
        <Field label="Locale" required {...field('defaultLocale')} />
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Status</span>
          <select
            {...field('status')}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </fieldset>

      {editing ? (
        <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-stone-900">Webhook</legend>
          <Field
            label="Consumer webhook URL"
            type="url"
            helper="Called after public content changes"
            {...field('webhookUrl')}
          />
          <WebhookSecretButton siteId={site!.id} />
        </fieldset>
      ) : null}

      <fieldset className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-stone-900">Publisher</legend>
        <Field label="Publisher name" {...field('publisherName')} />
        <Field label="Publisher URL" type="url" {...field('publisherUrl')} />
        <div className="sm:col-span-2">
          <Field label="Logo URL" type="url" {...field('publisherLogoUrl')} />
        </div>
      </fieldset>

      <fieldset className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-stone-900">Public paths</legend>
        <Field label="Blogs" required {...field('blogsPath')} />
        <Field label="Whitepapers" required {...field('whitepapersPath')} />
        <Field label="FAQ" required {...field('faqPath')} />
        <Field label="Release notes" required {...field('releaseNotesPath')} />
      </fieldset>

      <div className="flex gap-3">
        <button
          disabled={pending}
          className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Saving...' : editing ? 'Save site' : 'Create site'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:translate-y-px"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function WebhookSecretButton({ siteId }: { siteId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4">
      {secret ? (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">
            Copy this signing secret now—it cannot be shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-stone-950 px-3 py-2 text-xs text-stone-50">
            {secret}
          </code>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const response = await fetch(`/api/admin/sites/${siteId}/webhook-secret`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            const body = await response.json().catch(() => null);
            if (!response.ok)
              return setError(body?.error ?? 'Could not generate the webhook secret.');
            setSecret(body.secret);
          })
        }
        className="rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
      >
        {pending ? 'Generating…' : 'Generate new signing secret'}
      </button>
    </div>
  );
}

function Field({
  label,
  helper,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: string }) {
  return (
    <label className="space-y-2 text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        {...input}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-950 outline-none placeholder:text-stone-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
      {helper ? <span className="block text-xs font-normal text-stone-500">{helper}</span> : null}
    </label>
  );
}
