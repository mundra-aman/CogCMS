'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ApiKeyView } from '@/lib/auth/api-key';
import type { ApiKeyScope } from '@/models/ApiKey';

type IssuedKey = { key: ApiKeyView; plaintext: string };

export function ApiKeysPanel({ siteId }: { siteId: string }) {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [name, setName] = useState('Website');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['content:read']);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = async () => {
    const response = await fetch(`/api/admin/sites/${siteId}/api-keys`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load API keys');
    setKeys(await response.json());
  };

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Unable to load API keys'),
    );
  }, [siteId]);

  const mutate = (url: string, method: 'POST' | 'DELETE', body: unknown) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? 'The API key operation failed.');
        return;
      }
      if (payload?.plaintext) setIssued(payload as IssuedKey);
      await load();
    });
  };

  const toggleScope = (scope: ApiKeyScope) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope],
    );

  return (
    <section className="mt-10 space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-950">API keys</h2>
        <p className="mt-1 text-sm text-stone-600">
          Keys are shown once. Store them in the consumer's secret manager.
        </p>
      </div>

      {issued ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Copy this key now — it cannot be shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-stone-950 px-3 py-2 text-xs text-stone-50">
            {issued.plaintext}
          </code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(issued.plaintext)}
            className="mt-3 text-sm font-semibold text-amber-900 underline"
          >
            Copy key
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (scopes.length === 0) return setError('Select at least one scope.');
          mutate(`/api/admin/sites/${siteId}/api-keys`, 'POST', { name, scopes });
        }}
      >
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Key name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </label>
        <div className="flex flex-wrap items-end gap-3 pb-2 text-sm">
          {(['content:read', 'intake:write'] as const).map((scope) => (
            <label key={scope} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              {scope}
            </label>
          ))}
        </div>
        <button
          disabled={pending}
          className="w-fit rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          Issue key
        </button>
      </form>

      <div className="divide-y divide-stone-200 border-t border-stone-200">
        {keys.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">No API keys issued.</p>
        ) : null}
        {keys.map((key) => (
          <div
            key={key.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-stone-950">
                {key.name} <code className="text-xs text-stone-500">cms_{key.prefix}_…</code>
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {key.scopes.join(', ')} ·{' '}
                {key.revokedAt
                  ? 'revoked'
                  : key.expiresAt
                    ? `expires ${new Date(key.expiresAt).toLocaleString()}`
                    : 'no expiry'}
              </p>
            </div>
            {!key.revokedAt ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => mutate(`/api/admin/api-keys/${key.id}/rotate`, 'POST', {})}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"
                >
                  Rotate
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Revoke ${key.name}? Consumers using it will lose access.`))
                      mutate(`/api/admin/api-keys/${key.id}`, 'DELETE', {});
                  }}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
