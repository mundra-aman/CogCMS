'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useSite } from '@/components/admin/site-provider';

interface ActivityActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ActivityLogItem {
  _id: string;
  siteId: string;
  actor: ActivityActor;
  action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish';
  entityType: 'blog' | 'author' | 'faq' | 'whitepaper' | 'release_note';
  entityId: string;
  entityTitle: string;
  entitySlug: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_CONFIG: Record<ActivityLogItem['action'], { label: string; badgeClass: string }> = {
  create: {
    label: 'Created',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  update: {
    label: 'Updated',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  delete: {
    label: 'Deleted',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  publish: {
    label: 'Published',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  unpublish: {
    label: 'Unpublished',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
};

const ENTITY_CONFIG: Record<ActivityLogItem['entityType'], string> = {
  blog: 'Blog post',
  author: 'Author',
  faq: 'FAQ',
  whitepaper: 'Whitepaper',
  release_note: 'Release note',
};

function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function ActivityLogsPage() {
  const site = useSite();

  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [inspectItem, setInspectItem] = useState<ActivityLogItem | null>(null);

  // Debounce search query input by 300ms to reduce unneeded fetch cycles
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (actionFilter) params.set('action', actionFilter);
    if (entityFilter) params.set('entityType', entityFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);

    fetch(`/api/admin/activity-logs?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load activity logs');
        const data = await response.json();
        if (!controller.signal.aborted) {
          setItems(data.items ?? []);
          setPagination(
            data.pagination ?? {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 1,
            },
          );
          setState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });

    return () => controller.abort();
  }, [page, actionFilter, entityFilter, debouncedSearch, attempt]);

  function handleFilterReset() {
    setActionFilter('');
    setEntityFilter('');
    setSearchQuery('');
    setDebouncedSearch('');
    setPage(1);
  }

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">Activity log</h1>
          <p className="mt-2 text-sm text-stone-600">
            Chronological audit trail of editorial actions{site ? ` for ${site.name}` : ''}.
          </p>
        </div>
      </header>

      {/* Filter and search bar */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium text-stone-700">
          Search
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title or actor name"
            className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
          />
        </label>

        <label className="text-sm font-medium text-stone-700">
          Action filter
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 focus:border-stone-400 focus:outline-none"
          >
            <option value="">All actions</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="publish">Published</option>
            <option value="unpublish">Unpublished</option>
            <option value="delete">Deleted</option>
          </select>
        </label>

        <label className="text-sm font-medium text-stone-700">
          Entity type filter
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 focus:border-stone-400 focus:outline-none"
          >
            <option value="">All entity types</option>
            <option value="blog">Blog post</option>
            <option value="author">Author</option>
            <option value="faq">FAQ</option>
            <option value="whitepaper">Whitepaper</option>
            <option value="release_note">Release note</option>
          </select>
        </label>
      </div>

      {/* Status summary */}
      <div className="my-4 flex items-center justify-between text-sm text-stone-600">
        <p role="status">
          {state === 'ready'
            ? pagination.total > 0
              ? `Showing ${startRecord} to ${endRecord} of ${pagination.total} audit entries`
              : 'No audit records found'
            : state === 'loading'
              ? 'Loading audit records...'
              : ''}
        </p>
        {(actionFilter || entityFilter || debouncedSearch) && state === 'ready' ? (
          <button
            type="button"
            onClick={handleFilterReset}
            className="text-xs font-semibold text-orange-800 underline underline-offset-2 hover:text-orange-950"
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {/* Records container */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {state === 'loading' ? (
          <div role="status" className="space-y-4 p-6">
            <p className="text-sm text-stone-600">Loading activity trail...</p>
            {[1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                aria-hidden="true"
                className="h-14 rounded bg-stone-100 animate-pulse"
              />
            ))}
          </div>
        ) : null}

        {state === 'error' ? (
          <div role="alert" className="p-8 text-center">
            <h2 className="font-semibold text-stone-900">Activity logs could not be loaded</h2>
            <p className="mt-2 text-sm text-stone-600">
              There was a problem retrieving audit entries. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((v) => v + 1)}
              className="mt-4 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Try again
            </button>
          </div>
        ) : null}

        {state === 'ready' && items.length === 0 ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold text-stone-900">
              {pagination.total === 0 && !actionFilter && !entityFilter && !debouncedSearch
                ? 'No activity recorded yet'
                : 'No activity matches your filters'}
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              {pagination.total === 0 && !actionFilter && !entityFilter && !debouncedSearch
                ? 'Editorial actions performed in this site will appear here chronologically.'
                : 'Try adjusting your search terms or clearing the selected filters.'}
            </p>
            {actionFilter || entityFilter || debouncedSearch ? (
              <button
                type="button"
                onClick={handleFilterReset}
                className="mt-4 inline-block text-sm font-semibold text-orange-800 underline underline-offset-4 hover:text-orange-950"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        ) : null}

        {state === 'ready' && items.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {items.map((item) => {
              const actionMeta = ACTION_CONFIG[item.action] ?? {
                label: item.action,
                badgeClass: 'bg-stone-100 text-stone-800 border-stone-200',
              };
              const entityLabel = ENTITY_CONFIG[item.entityType] ?? item.entityType;

              return (
                <div
                  key={item._id}
                  className="flex flex-col gap-3 p-5 transition-colors hover:bg-stone-50/70 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${actionMeta.badgeClass}`}
                      >
                        {actionMeta.label}
                      </span>
                      <span className="text-xs font-medium text-stone-500">{entityLabel}</span>
                      <span aria-hidden="true" className="text-stone-300">
                        ·
                      </span>
                      <time dateTime={item.createdAt} className="text-xs text-stone-500">
                        {formatDateTime(item.createdAt)}
                      </time>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                      <h2 className="break-words text-sm font-semibold text-stone-900">
                        {item.entityTitle || 'Untitled'}
                      </h2>
                      {item.entitySlug ? (
                        <span className="text-xs text-stone-500">/{item.entitySlug}</span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-xs text-stone-500">
                      By <span className="font-medium text-stone-700">{item.actor.name}</span> (
                      {item.actor.email})
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Inspect activity details for ${item.entityTitle || 'entry'}`}
                      onClick={() => setInspectItem(item)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Pagination navigation */}
      {state === 'ready' && pagination.totalPages > 1 ? (
        <nav
          aria-label="Activity log pagination"
          className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-stone-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      ) : null}

      {/* Inspect details modal */}
      <AlertDialog.Root
        open={Boolean(inspectItem)}
        onOpenChange={(open) => {
          if (!open) setInspectItem(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold text-stone-900">
              Audit entry details
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-xs text-stone-500">
              Record identifier: {inspectItem?._id}
            </AlertDialog.Description>

            {inspectItem ? (
              <div className="mt-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-stone-100 bg-stone-50 p-3">
                  <div>
                    <span className="font-semibold text-stone-700">Action:</span>
                    <p className="capitalize text-stone-900">{inspectItem.action}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">Entity Type:</span>
                    <p className="text-stone-900">
                      {ENTITY_CONFIG[inspectItem.entityType] ?? inspectItem.entityType}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">Timestamp:</span>
                    <p className="text-stone-900">{formatDateTime(inspectItem.createdAt)}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">ISO Timestamp:</span>
                    <p className="break-all font-mono text-[11px] text-stone-700">
                      {inspectItem.createdAt}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                  <span className="font-semibold text-stone-700">Actor Identity:</span>
                  <div className="mt-1 space-y-0.5 text-stone-900">
                    <p>
                      <span className="text-stone-500">Name:</span> {inspectItem.actor.name}
                    </p>
                    <p>
                      <span className="text-stone-500">Email:</span> {inspectItem.actor.email}
                    </p>
                    <p>
                      <span className="text-stone-500">Role:</span> {inspectItem.actor.role}
                    </p>
                    <p className="break-all font-mono text-[11px] text-stone-500">
                      ID: {inspectItem.actor.id}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                  <span className="font-semibold text-stone-700">Target Entity:</span>
                  <div className="mt-1 space-y-0.5 text-stone-900">
                    <p>
                      <span className="text-stone-500">Title:</span>{' '}
                      {inspectItem.entityTitle || 'Untitled'}
                    </p>
                    {inspectItem.entitySlug ? (
                      <p>
                        <span className="text-stone-500">Slug:</span> /{inspectItem.entitySlug}
                      </p>
                    ) : null}
                    <p className="break-all font-mono text-[11px] text-stone-500">
                      Entity ID: {inspectItem.entityId}
                    </p>
                  </div>
                </div>

                {inspectItem.metadata && Object.keys(inspectItem.metadata).length > 0 ? (
                  <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                    <span className="font-semibold text-stone-700">Operational Metadata:</span>
                    <pre className="mt-1.5 max-h-40 overflow-x-auto rounded bg-stone-100 p-2 font-mono text-[11px] text-stone-800">
                      {JSON.stringify(inspectItem.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Close
                </button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
