'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSite } from '@/components/admin/site-provider';

// Client side interfaces for types safety 
interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor';
}

interface AuditLogItem {
  _id: string;
  siteId: string;
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
  // Using custom hook to fetch the site context
  const site = useSite();
  // Hold the Log items coming from the API
  const [data, setData] = useState<AuditLogItem[]>([]);
  // Store Pagination Metadata
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  // Track if the API network is in flight
  const [loading, setLoading] = useState(true);
  // Hold error cleanly
  const [error, setError] = useState<string | null>(null);

  // Store custom filters: Search bar, Entity Type dropdown, Pagination
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [page, setPage] = useState(1);

  // UseTransition hook for Concurrent Mode; Without it, if a user types fast in a search input that also triggers state updates, the browser input can lag or drop keystrokes;
  const [, startTransition] = useTransition();

  // Using UseEffect: To synchronize the component with the server whenever the user changes a page, types a search query, selects an entity filter, or switches the active site.
  useEffect(() => {
    // Race Condition Shield: If 1 Request takes 300ms but another later Request takes only 50ms, Request 1 could finish last and overwrite the screen with its results even though the user sent another request later.
    let ignore = false;

    // Set Loading and Error state
    setLoading(true);
    setError(null);

    // Building the Query String Dynamically: URLSearchParams(...): Standard browser API that encodes key-value pairs into a clean URL query string (e.g. page=1&limit=20&search=hello). It automatically handles URL encoding (e.g. spaces become + or %20).
    const query = new URLSearchParams({
      page: page.toString(),
      limit: '20',
      // Conditional Spread: If the user has typed text, { search: '...' } is included. If search is empty or just spaces, it spreads an empty object {}—so search= isn't sent unnecessarily in the URL.
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(entityType !== 'all' ? { entityType } : {}),
    });

    // cache: 'no-store': Do not cache this response; always hit the server for live real-time audit entries
    fetch(`/api/admin/audit-logs?${query.toString()}`, { cache: 'no-store' })
      // These three chained .then() and .catch() blocks handle the entire lifecycle of the HTTP response; Unlike Axios or Python requests.raise_for_status(), the native browser fetch() API does NOT reject or throw an error on HTTP error codes like 403, 404, or 500! It only rejects on total network failures (e.g., computer is offline); res.ok is a built-in boolean that is true only for status codes in the range 200–299;
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied. Administrator privileges required.');
          }
          throw new Error('Failed to load audit logs.');
        }
        return res.json() as Promise<AuditLogResponse>;
      })
      // Applying Fresh State to the UI: Only when Block 1 successfully parses the JSON payload; If the user typed a new search query or switched pages while this request was still traveling across the internet, the cleanup function set ignore = true; If ignore === true, we do nothing! We drop this stale response on the floor;
      .then((json) => {
        if (!ignore) {
          setData(json.data);
          setMeta(json.meta);
          setLoading(false);
        }
      })
      // Graceful Failure Recovery: Stores the exact error text so the JSX can display an accessible alert banner;
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          setLoading(false);
        }
      });

    // When a dependency changes (e.g., user types a new letter), React runs the cleanup function on the previous effect; If ignore === true, the stale response is silently discarded! Only the freshest, most recent request updates the UI.
    return () => {
      ignore = true;
    };
  }, [page, search, entityType, site?.id]); // Dependency Array: This array tells React when to re-run the effect

  // Helper function to handle search box value changes
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    startTransition(() => {
      setSearch(val);
      setPage(1);
    });
  }

  // Helper function to handle Entity dropdown value changes
  function handleEntityFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setEntityType(val);
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
            Activity and mutation history scoped to{' '}
            <span className="font-medium text-stone-900">
              {site?.name ?? 'the active site'}
            </span>
            .
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <input
            type="search"
            placeholder="Search by target title, actor name, email, or action..."
            value={search}
            onChange={handleSearchChange}
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
                        <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-stone-700">
                          {item.entityType.replace('_', ' ')}
                        </span>
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
