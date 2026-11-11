'use client';
import { useState } from 'react';
import type { ConnectionParameters } from '@/lib/publishing/connect';
export default function Consent({
  request,
  sites,
}: {
  request: ConnectionParameters;
  sites: Array<{ id: string; name: string; domain: string }>;
}) {
  const [siteId, setSite] = useState(sites.length === 1 ? sites[0].id : '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cancel = new URL(request.redirectUri);
  cancel.search = new URLSearchParams({ state: request.state, error: 'access_denied' }).toString();
  async function approve(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/content-studio/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, siteId }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error?.message || body.error || 'Could not approve the connection. Try again.',
        );
      window.location.assign(body.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setBusy(false);
    }
  }
  return (
    <main className="cms-workspace flex min-h-[100dvh] items-center justify-center bg-stone-50 px-5 py-12 text-stone-950">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your website</h1>
        <p className="mt-4 break-words text-sm leading-6 text-stone-600">
          Allow Content Studio at {new URL(request.redirectUri).origin} to publish and schedule
          blogs for <strong>{request.brandLabel}</strong>, and show CMS blog updates in the App.
        </p>
        <form onSubmit={approve} className="mt-6 grid gap-5" aria-busy={busy}>
          <label className="grid gap-2 text-sm font-medium">
            Website
            <select
              aria-label="Website"
              value={siteId}
              onChange={(e) => setSite(e.target.value)}
              required
              disabled={busy || !sites.length}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3"
            >
              <option value="">Choose a website</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} - {s.domain}
                </option>
              ))}
            </select>
          </label>
          {!sites.length && (
            <p role="status" className="text-sm">
              No active websites are available. Ask your CMS administrator for website access.
            </p>
          )}
          <p className="text-sm leading-6 text-stone-600">
            Approval creates a dedicated publishing key for this website. Content Studio saves it
            securely. You can disconnect the website in the App.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy || !siteId}
            className="rounded-lg bg-orange-700 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {busy ? 'Connecting...' : 'Approve connection'}
          </button>
          <a href={cancel.toString()} className="text-center text-sm underline">
            Cancel
          </a>
        </form>
      </section>
    </main>
  );
}
