'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Version = {
  id: string;
  version: number;
  changeType: 'create' | 'update' | 'restore';
  title: string;
  slug: string;
  status: 'draft' | 'publish';
  createdBy: string | null;
  createdAt: string;
};

export default function VersionHistory({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/admin/blogs/${encodeURIComponent(slug)}/versions`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load version history');
        if (!cancelled) setVersions(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load version history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  async function restore(version: number) {
    if (
      restoring ||
      !window.confirm(`Restore version ${version}? Your current content will be saved as a new version first.`)
    ) {
      return;
    }

    setRestoring(version);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/blogs/${encodeURIComponent(slug)}/versions/${version}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to restore version');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore version');
      setRestoring(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border px-4 py-2 text-[13px] text-gray-600 transition-colors hover:bg-gray-50"
        style={{ fontWeight: 500, borderColor: 'rgba(0,0,0,0.12)' }}
      >
        Version history
      </button>

      {typeof document !== 'undefined' && open
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
              <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="version-history-title"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 id="version-history-title" className="text-lg font-semibold text-stone-900">
                  Version history
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Every successful save creates a recoverable snapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? <p className="p-4 text-sm text-stone-500">Loading versions…</p> : null}
              {error ? (
                <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
              {!loading && !error && versions.length === 0 ? (
                <p className="p-4 text-sm text-stone-500">No versions have been recorded yet.</p>
              ) : null}

              <div className="space-y-2">
                {versions.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-stone-900">Version {item.version}</span>
                        {index === 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Current
                          </span>
                        ) : null}
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
                          {item.changeType}
                        </span>
                        <span className="text-xs text-stone-500">
                          {item.status === 'publish' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-stone-700">{item.title}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {index !== 0 ? (
                      <button
                        type="button"
                        onClick={() => restore(item.version)}
                        disabled={restoring !== null}
                        className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                      >
                        {restoring === item.version ? 'Restoring…' : 'Restore'}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
