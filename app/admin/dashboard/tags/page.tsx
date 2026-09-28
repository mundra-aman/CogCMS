'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface Tag {
  _id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  status: 'draft' | 'publish';
  createdAt: string;
  updatedAt: string;
}

const PRESET_COLORS = [
  '#FF751F',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#f59e0b',
  '#14b8a6',
  '#ec4899',
  '#6366f1',
  '#64748b',
];

export default function AdminTagsList() {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTag, setDeleteTag] = useState<Tag | null>(null);

  useEffect(() => {
    fetch('/api/admin/tags')
      .then((r) => r.json())
      .then((data) => {
        setTags(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const confirmDelete = async () => {
    if (!deleteTag) return;
    try {
      const res = await fetch(`/api/admin/tags/${deleteTag._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setTags(tags.filter((t) => t._id !== deleteTag._id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteTag(null);
    }
  };

  const filtered = search.trim()
    ? tags.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : tags;

  const publishedCount = tags.filter((t) => t.status === 'publish').length;
  const draftCount = tags.filter((t) => t.status === 'draft').length;

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="max-w-5xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/dashboard"
              className="text-gray-400 hover:text-gray-800 transition-colors"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1
                className="text-2xl md:text-3xl"
                style={{
                  fontWeight: 600,
                  color: '#1a1a1a',
                  letterSpacing: '-0.03em',
                }}
              >
                Tags
              </h1>
              {!loading && (
                <p className="text-xs text-gray-400 mt-1">
                  {publishedCount} published · {draftCount} drafts
                </p>
              )}
            </div>
          </div>
          <Link
            href="/admin/dashboard/tags/new"
            className="px-5 py-2.5 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm"
            style={{
              background: 'linear-gradient(135deg, #FF751F, #ff9044)',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
            }}
          >
            + New Tag
          </Link>
        </div>

        {/* Search */}
        {!loading && tags.length > 0 && (
          <div className="mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags by name or slug…"
              className="w-full max-w-sm px-4 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm"
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            />
          </div>
        )}

        {/* Tags Grid */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(16px)',
            borderColor: 'rgba(0,0,0,0.06)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
          }}
        >
          {loading ? (
            <div className="p-12 text-center">
              <div
                className="inline-block h-6 w-6 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin"
                role="status"
              />
              <p className="text-gray-400 mt-3 text-sm">Loading tags…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FF751F"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <p className="text-gray-500 mb-1" style={{ fontWeight: 500 }}>
                {search ? 'No tags match your search.' : 'No tags yet.'}
              </p>
              <p className="text-sm text-gray-400">
                {search
                  ? 'Try a different search term.'
                  : 'Create your first tag to start organizing content.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-black/[0.04]">
              {filtered.map((tag) => (
                <div
                  key={tag._id}
                  className="bg-white hover:bg-orange-50/40 transition-colors p-5 group relative"
                >
                  {/* Color dot + name */}
                  <div className="flex items-start gap-3 mb-3">
                    <span
                      className="mt-1 h-4 w-4 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: tag.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-[15px] text-[#1a1a1a] truncate"
                        style={{ fontWeight: 600 }}
                      >
                        {tag.name}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5 font-mono truncate">
                        /{tag.slug}
                      </p>
                    </div>
                    {tag.status === 'draft' && (
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
                        style={{
                          fontWeight: 600,
                          color: '#d97706',
                          background: 'rgba(217,119,6,0.08)',
                          border: '1px solid rgba(217,119,6,0.15)',
                        }}
                      >
                        Draft
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {tag.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 mb-3 leading-relaxed">
                      {tag.description}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/admin/dashboard/tags/${tag._id}`}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-orange-50 transition-colors"
                      style={{
                        borderColor: 'rgba(255,117,31,0.2)',
                        color: '#FF751F',
                        fontWeight: 500,
                      }}
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => setDeleteTag(tag)}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                      style={{
                        borderColor: 'rgba(239,68,68,0.2)',
                        color: '#ef4444',
                        fontWeight: 500,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Color Legend */}
        {!loading && tags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-gray-400" style={{ fontWeight: 500 }}>
              Colors in use:
            </span>
            {Array.from(new Set(tags.map((t) => t.color))).map((color) => (
              <span key={color} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-gray-400 font-mono">{color}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={!!deleteTag} onOpenChange={(open) => !open && setDeleteTag(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content
            className="fixed left-[50%] top-[50%] z-[100] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-8 shadow-2xl sm:rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            <div className="flex flex-col gap-3 text-center sm:text-left">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 sm:mx-0">
                <svg
                  className="h-8 w-8 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <AlertDialog.Title className="text-xl font-semibold text-gray-900 mt-2 tracking-tight">
                Delete &ldquo;{deleteTag?.name}&rdquo;?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-gray-500 leading-relaxed font-medium">
                Are you absolutely sure? This action cannot be undone and will permanently remove
                this tag from your site.
              </AlertDialog.Description>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 mt-4">
              <AlertDialog.Cancel asChild>
                <button className="mt-3 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={confirmDelete}
                  className="inline-flex w-full justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:w-auto transition-colors"
                >
                  Yes, delete it
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
