'use client';

import { useEffect, useState, useTransition } from 'react';
import type { WebhookSubscriptionEvent } from '@/lib/webhooks/events';
import { WEBHOOK_SUBSCRIPTION_EVENTS } from '@/lib/webhooks/events';

type SubscriptionView = {
  _id: string;
  url: string;
  events: WebhookSubscriptionEvent[];
  active: boolean;
  lastDelivery: { status: 'success' | 'failed'; statusCode: number; timestamp: string } | null;
  createdAt: string;
};

type IssuedSubscription = { subscription: SubscriptionView; secret: string };

function DeliveryBadge({ lastDelivery }: { lastDelivery: SubscriptionView['lastDelivery'] }) {
  if (!lastDelivery) {
    return (
      <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
        No delivery yet
      </span>
    );
  }
  const isSuccess = lastDelivery.status === 'success';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
      }`}
    >
      {isSuccess ? '✓' : '✗'} {lastDelivery.statusCode || 'timeout'} ·{' '}
      {new Date(lastDelivery.timestamp).toLocaleString()}
    </span>
  );
}

export function WebhooksPanel({ siteId }: { siteId: string }) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookSubscriptionEvent[]>([
    'content.published',
    'content.updated',
  ]);
  const [issued, setIssued] = useState<IssuedSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/api/admin/sites/${siteId}/webhook-subscriptions`;

  const load = async () => {
    const response = await fetch(base, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load webhooks');
    setSubscriptions(await response.json());
  };

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Unable to load webhooks'),
    );
  }, [siteId]);

  const mutate = (url: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? 'The webhook operation failed.');
        return;
      }
      if (payload?.secret) setIssued(payload as IssuedSubscription);
      await load();
    });
  };

  const toggleEvent = (event: WebhookSubscriptionEvent) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((e) => e !== event) : [...current, event],
    );

  return (
    <section className="mt-10 space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-950">Webhooks</h2>
        <p className="mt-1 text-sm text-stone-600">
          Register URLs to receive signed payloads when content is published or changed.
        </p>
      </div>

      {issued ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Copy this signing secret now — it cannot be shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-stone-950 px-3 py-2 text-xs text-stone-50">
            {issued.secret}
          </code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(issued.secret)}
            className="mt-3 text-sm font-semibold text-amber-900 underline"
          >
            Copy secret
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        className="space-y-4 rounded-xl border border-stone-200 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (events.length === 0) return setError('Select at least one event.');
          setIssued(null);
          mutate(base, 'POST', { url, events });
        }}
      >
        <p className="text-sm font-semibold text-stone-700">Add webhook</p>
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Endpoint URL (https required)</span>
          <input
            id="webhook-url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            type="url"
            placeholder="https://your-site.example.com/api/webhook"
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </label>
        <div className="space-y-2 text-sm font-medium text-stone-700">
          <span>Events</span>
          <div className="flex flex-wrap gap-3 pt-1">
            {WEBHOOK_SUBSCRIPTION_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`event-${event}`}
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                {event}
              </label>
            ))}
          </div>
        </div>
        <button
          disabled={pending}
          className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          Add webhook
        </button>
      </form>

      <div className="divide-y divide-stone-200 border-t border-stone-200">
        {subscriptions.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">No webhook subscriptions registered.</p>
        ) : null}
        {subscriptions.map((sub) => (
          <div
            key={sub._id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-950">{sub.url}</p>
              <p className="mt-1 text-xs text-stone-500">{sub.events.join(', ')}</p>
              <div className="mt-2">
                <DeliveryBadge lastDelivery={sub.lastDelivery} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  mutate(`${base}/${sub._id}`, 'PATCH', { active: !sub.active })
                }
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  sub.active
                    ? 'border-stone-300 text-stone-700 hover:bg-stone-50'
                    : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                } disabled:opacity-60`}
              >
                {sub.active ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Delete webhook for ${sub.url}?`))
                    mutate(`${base}/${sub._id}`, 'DELETE', {});
                }}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
