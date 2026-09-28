import { after } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import WebhookSubscription from '@/models/WebhookSubscription';
import type { WebhookEvent } from '@/lib/webhook';
import { deliverSubscriptionWebhook, type SubscriptionPayload } from '@/lib/webhooks/deliver';

/**
 * Schedules fan-out delivery to all active webhook subscriptions that match the
 * given event, using Next.js `after()` so the delivery happens after the HTTP
 * response has been sent to the editor.
 *
 * This is intentionally fire-and-forget: content mutations already succeeded by
 * the time dispatch runs, so delivery errors are logged but never rethrown.
 *
 * @param siteId - The site whose subscriptions should be queried.
 * @param event  - The webhook event to fan out, as produced by lib/webhook.ts.
 */
export function dispatchSubscriptionWebhooks(siteId: string, event: WebhookEvent): void {
  try {
    after(async () => {
      try {
        await connectToDatabase();
        // Pull `secret` explicitly — it is excluded from default projections.
        const subscriptions = await WebhookSubscription.find({
          siteId,
          active: true,
          events: event.type,
        })
          .select('+secret')
          .exec();

        if (subscriptions.length === 0) return;

        const payload: SubscriptionPayload = {
          type: event.type,
          siteId,
          contentType: event.contentType,
          slug: event.slug,
          id: event.id,
          at: new Date().toISOString(),
        };

        await Promise.allSettled(
          subscriptions.map(async (sub) => {
            try {
              // `secret` is populated via +secret projection above.
              const result = await deliverSubscriptionWebhook(
                { _id: sub._id, url: sub.url, secret: (sub as typeof sub & { secret: string }).secret },
                payload,
              );
              await WebhookSubscription.updateOne(
                { _id: sub._id },
                {
                  $set: {
                    lastDelivery: {
                      status: result.status,
                      statusCode: result.statusCode,
                      timestamp: new Date(),
                    },
                  },
                },
              ).exec();
            } catch {
              console.warn('[cms] subscription webhook dispatch error', { url: sub.url });
            }
          }),
        );
      } catch {
        console.warn('[cms] subscription webhook dispatch failed');
      }
    });
  } catch {
    // after() can throw outside a request context; the mutation has already succeeded.
    console.warn('[cms] subscription webhook scheduling failed');
  }
}
