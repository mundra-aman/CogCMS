'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DiffSegment, FieldChange } from '@/lib/blog-revisions/diff';
import type { BlogRevisionSummary } from '@/lib/blog-revisions/store';

type RevisionDetail = {
  revision: BlogRevisionSummary;
  restoreChanges: FieldChange[];
  contentDiff: DiffSegment[] | null;
  contentDiffTooLarge: boolean;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-gray-700">
      {segments.map((segment, index) =>
        segment.type === 'same' ? (
          <span key={index}>{segment.text}</span>
        ) : segment.type === 'added' ? (
          <ins key={index} className="rounded bg-green-100 text-green-900 no-underline">
            {segment.text}
          </ins>
        ) : (
          <del key={index} className="rounded bg-red-100 text-red-800">
            {segment.text}
          </del>
        ),
      )}
    </p>
  );
}

export function BlogHistoryPanel({
  slug,
  hasUnsavedChanges,
  onClose,
  onRestored,
}: {
  slug: string;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<BlogRevisionSummary[] | null>(null);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/admin/blogs/${encodeURIComponent(slug)}/revisions`;

  const loadList = useCallback(async () => {
    const response = await fetch(base, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to load version history');
    setItems(payload.items);
    setLimit(payload.limit);
  }, [base]);

  useEffect(() => {
    void loadList().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Unable to load version history'),
    );
  }, [loadList]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetch(`${base}/${selected}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'Unable to load this version');
        // Ignore a slow response for a version the user has already clicked away from.
        if (!cancelled) setDetail(payload);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Request failed');
      });
    return () => {
      cancelled = true;
    };
  }, [base, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const restore = async () => {
    if (!detail) return;
    const warning = hasUnsavedChanges
      ? 'You have unsaved changes in the editor. They will be lost.\n\n'
      : '';
    if (
      !window.confirm(
        `${warning}Restore the version from ${formatWhen(detail.revision.savedAt)}? ` +
          'The current version will be kept in history, so you can undo this.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${detail.revision.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldError = payload?.details?.fieldErrors?.authorId?.[0];
        throw new Error(fieldError ?? payload?.error ?? 'Restore failed');
      }
      setSelected(null);
      await loadList();
      onRestored();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close version history"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header
          className="flex items-start justify-between gap-4 px-6 py-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div>
            <h2 className="text-[17px] font-semibold text-gray-900">Version history</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              The last {limit} saved versions are kept. Restoring keeps the post&apos;s current URL
              and publish status.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[13px] text-gray-400 hover:bg-gray-50 hover:text-gray-800"
          >
            Close
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {selected ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900"
              >
                ← All versions
              </button>
              {!detail ? (
                <p className="text-[13px] text-gray-400">Loading version…</p>
              ) : (
                <>
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900">
                      {detail.revision.title}
                    </p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      Saved {formatWhen(detail.revision.savedAt)}
                      {detail.revision.savedBy ? ` by ${detail.revision.savedBy.name}` : ''}
                    </p>
                  </div>

                  {detail.restoreChanges.length === 0 ? (
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                      This version matches the current post.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                        Restoring will change
                      </p>
                      <ul className="space-y-1.5 text-[13px] text-gray-700">
                        {detail.restoreChanges
                          .filter((change) => change.field !== 'content')
                          .map((change) => (
                            <li key={change.field} className="break-words">
                              <span className="font-medium">{change.label}:</span>{' '}
                              <del className="text-red-700">{change.from}</del> →{' '}
                              <ins className="text-green-800 no-underline">{change.to}</ins>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {detail.contentDiff ? (
                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                        Content{' '}
                        <span className="font-normal normal-case tracking-normal">
                          (red is removed, green comes back)
                        </span>
                      </p>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <DiffView segments={detail.contentDiff} />
                      </div>
                    </div>
                  ) : detail.contentDiffTooLarge ? (
                    <p className="text-[13px] text-gray-500">
                      The content changed too much to show a word-by-word comparison.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : items === null ? (
            <p className="text-[13px] text-gray-400">Loading history…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-gray-500">
              No earlier versions yet. Each time this post is saved, the previous version appears
              here.
            </p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className="flex w-full flex-col items-start gap-1 rounded-lg px-2 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="text-[14px] font-medium text-gray-900">{item.title}</span>
                    <span className="text-[12px] text-gray-500">
                      {formatWhen(item.savedAt)}
                      {item.savedBy ? ` · ${item.savedBy.name}` : ''} ·{' '}
                      {item.status === 'publish' ? 'published' : 'draft'}
                    </span>
                    {item.reason === 'restore' ? (
                      <span className="text-[11px] text-amber-700">
                        Replaced when an older version was restored
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {selected && detail && detail.restoreChanges.length > 0 ? (
          <footer className="px-6 py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void restore()}
              className="w-full rounded-full px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1a8917, #2ba52b)' }}
            >
              {busy ? 'Restoring…' : 'Restore this version'}
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
