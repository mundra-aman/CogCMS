'use client';

import { useEffect, useState } from 'react';
import { useSite } from '@/components/admin/site-provider';

interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor';
}

interface AuditLogItem {
  _id: string;
  siteId: string | null;
  actor: AuditActor;
  entityType: 'blog' | 'event' | 'user' | 'site' | 'api_key';
  entityId: string;
  entityTitle: string;
  action: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditLogItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function AuditLogsPage() {
  const site = useSite();
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const query = new URLSearchParams({
      page: page.toString(),
      limit: '20',
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(entityType !== 'all' ? { entityType } : {}),
    });

    fetch(`/api/admin/audit-logs?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied. Administrator privileges required.');
          }
          throw new Error('Failed to load audit logs.');
        }
        return res.json() as Promise<AuditLogResponse>;
      })
      .then((json) => {
        if (!controller.signal.aborted) {
          setData(json.data);
          setMeta(json.meta);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [page, debouncedSearch, entityType, site?.id]);

  function handleEntityFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    setEntityType(e.target.value);
    setPage(1);
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            Audit Log
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Activity and mutation history for{' '}
            <span className="font-medium text-stone-900">
              {site?.name ?? 'the active site'}
            </span>{' '}
            plus global user and site events.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <input
            type="search"
            placeholder="Search by target title, actor name, email, or action..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <select
            value={entityType}
            onChange={handleEntityFilter}
            aria-label="Filter by entity type"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="all">All Entities</option>
            <option value="blog">Blogs</option>
            <option value="event">Events</option>
            <option value="user">Users</option>
            <option value="site">Sites</option>
            <option value="api_key">API Keys</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">
            Loading activity history...
          </p>
        ) : error ? (
          <p role="alert" className="p-8 text-center text-sm text-red-600">
            {error}
          </p>
        ) : data.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">
            No audit records found matching your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-600">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Timestamp
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Actor
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Entity
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Target
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Action
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.map((item) => {
                  const date = new Date(item.createdAt);
                  return (
                    <tr
                      key={item._id}
                      className="transition-colors hover:bg-stone-50/70"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-stone-500">
                        {date.toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className="block font-medium text-stone-900">
                          {item.actor.name}
                        </span>
                        <span className="block text-xs text-stone-500">
                          {item.actor.email}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-stone-700">
                            {item.entityType.replace('_', ' ')}
                          </span>
                          {item.siteId === null && (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Global
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-5 py-4 font-medium text-stone-900">
                        {item.entityTitle}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            item.action === 'delete' || item.action === 'revoke'
                              ? 'bg-rose-50 text-rose-700'
                              : item.action === 'publish'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {item.action}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-5 py-4 text-xs text-stone-500">
                        {item.details && Object.keys(item.details).length > 0 ? (
                          <code>{JSON.stringify(item.details)}</code>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50/50 px-5 py-3 text-xs text-stone-600">
            <span>
              Showing Page <span className="font-semibold text-stone-900">{meta.page}</span> of{' '}
              <span className="font-semibold text-stone-900">{meta.totalPages}</span> ({meta.total} records)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
