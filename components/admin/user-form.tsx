'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminSiteView, AdminUserView } from '@/lib/admin/serializers';

export function UserForm({ user }: { user?: AdminUserView }) {
  const router = useRouter();
  const [sites, setSites] = useState<AdminSiteView[]>([]);
  const [form, setForm] = useState({
    email: user?.email ?? '',
    name: user?.name ?? '',
    role: user?.role ?? ('editor' as const),
    siteIds: user?.siteIds ?? [],
    status: user?.status ?? ('active' as const),
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(user);

  useEffect(() => {
    fetch('/api/admin/sites', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setSites(Array.isArray(data) ? data : []))
      .catch(() => setError('Sites could not be loaded.'));
  }, []);

  const inputClass =
    'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-950 outline-none placeholder:text-stone-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const payload = {
            email: form.email,
            name: form.name,
            role: form.role,
            siteIds: form.siteIds,
            status: form.status,
            ...(form.password ? { password: form.password } : {}),
          };
          const response = await fetch(
            editing ? `/api/admin/users/${user!.id}` : '/api/admin/users',
            {
              method: editing ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            setError(body?.error ?? 'The user could not be saved.');
            return;
          }
          router.push('/admin/dashboard/users');
          router.refresh();
        });
      }}
    >
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Name</span>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Email</span>
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} />
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Role</span>
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'admin' | 'editor' })} className={inputClass}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Status</span>
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as 'active' | 'disabled' })} className={inputClass}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700 sm:col-span-2">
          <span>{editing ? 'New password (optional)' : 'Password'}</span>
          <input required={!editing} type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={inputClass} autoComplete="new-password" />
          <span className="block text-xs font-normal text-stone-500">12-72 UTF-8 bytes.</span>
        </label>
      </div>

      <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-stone-900">Site access</legend>
        <p className="mb-4 text-xs leading-5 text-stone-500">Editors need at least one site. An empty admin selection grants all active sites.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.filter((site) => site.status === 'active').map((site) => (
            <label key={site.id} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={form.siteIds.includes(site.id)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    siteIds: event.target.checked
                      ? [...current.siteIds, site.id]
                      : current.siteIds.filter((id) => id !== site.id),
                  }))
                }
                className="h-4 w-4 accent-orange-600"
              />
              {site.name}
            </label>
          ))}
          {sites.length === 0 ? <p className="text-sm text-stone-500">Create a site before adding an editor.</p> : null}
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button disabled={pending} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 active:translate-y-px disabled:opacity-60">
          {pending ? 'Saving...' : editing ? 'Save user' : 'Create user'}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:translate-y-px">
          Cancel
        </button>
      </div>
    </form>
  );
}
