'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSite } from '@/components/admin/site-provider';
import { publicUrlFor } from '@/lib/site/urls';

interface ReleaseNoteRow {
  _id: string;
  slug: string;
  version: string;
  dateInput: string;
  status: 'draft' | 'publish';
}

export default function ReleaseNotesPage() {
  const site = useSite();
  const [notes, setNotes] = useState<ReleaseNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!site?.id) {
      setNotes([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/admin/release-notes', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load release notes.');
        setNotes(Array.isArray(body) ? body : []);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Could not load release notes.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [site?.id]);

  async function remove(slug: string) {
    if (!window.confirm(`Delete release note ${slug}?`)) return;
    const response = await fetch(`/api/admin/release-notes/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) setNotes((current) => current.filter((note) => note.slug !== slug));
    else setError((await response.json()).error || 'Could not delete release note.');
  }

  const publicBase = site ? publicUrlFor(site, 'releaseNotes') : null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-orange-700">{site?.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Release notes</h1>
          <p className="mt-2 text-sm text-stone-600">
            Edit versioned updates stored for this site.
          </p>
        </div>
        <Link
          href="/admin/dashboard/release-notes/new"
          className="w-fit rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 active:translate-y-px"
        >
          New release note
        </Link>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-stone-500">Loading release notes…</p>
        ) : notes.length === 0 ? (
          <p className="p-8 text-sm text-stone-500">No release notes for this site.</p>
        ) : (
          notes.map((note, index) => (
            <article
              key={note._id}
              className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${index ? 'border-t border-stone-100' : ''}`}
            >
              <div>
                <Link
                  href={`/admin/dashboard/release-notes/new?slug=${encodeURIComponent(note.slug)}`}
                  className="font-semibold text-stone-900 hover:text-orange-700"
                >
                  Version {note.version}
                </Link>
                <p className="mt-1 text-xs text-stone-500">
                  {note.dateInput} · {note.slug}
                  {note.status === 'draft' ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      Draft
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {note.status === 'publish' && publicBase ? (
                  <a
                    href={`${publicBase}#${encodeURIComponent(note.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-orange-300"
                  >
                    View
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(note.slug)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
