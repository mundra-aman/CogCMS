'use client';

import { useEffect, useState } from 'react';
import { useSite } from '@/components/admin/site-provider';

interface Subscriber {
  _id: string;
  email: string;
  source: string;
  submitCount: number;
  firstSubscribedAt: string;
  lastSubscribedAt: string;
}

export default function SubscribersPage() {
  const site = useSite();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!site?.id) {
      setSubscribers([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/admin/newsletter-subscribers', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load subscribers.');
        setSubscribers(Array.isArray(body) ? body : []);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Could not load subscribers.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [site?.id]);

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-orange-700">{site?.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Subscribers</h1>
          <p className="mt-2 text-sm text-stone-600">
            Site-scoped newsletter signups and repeat submissions.
          </p>
        </div>
        <a
          href="/api/admin/newsletter-subscribers?format=csv"
          className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-orange-300 hover:text-orange-700"
        >
          Export CSV
        </a>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-stone-500">Loading subscribers…</p>
        ) : subscribers.length === 0 ? (
          <p className="p-8 text-sm text-stone-500">No newsletter subscribers for this site.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Submissions</th>
                <th className="px-5 py-3 font-semibold">First subscribed</th>
                <th className="px-5 py-3 font-semibold">Latest</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((subscriber) => (
                <tr key={subscriber._id} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-4 font-medium text-stone-900">{subscriber.email}</td>
                  <td className="px-5 py-4 text-stone-600">{subscriber.source}</td>
                  <td className="px-5 py-4 tabular-nums text-stone-600">
                    {subscriber.submitCount}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {new Date(subscriber.firstSubscribedAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {new Date(subscriber.lastSubscribedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
