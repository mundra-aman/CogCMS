import type { IWebhookSubscription } from '@/models/WebhookSubscription';
import { signWebhookPayload } from '@/lib/webhooks/sign';

export const SUBSCRIPTION_TIMEOUT_MS = 5_000;
export const SUBSCRIPTION_RETRY_DELAY_MS = 2_000;

/** Shape of the JSON body sent to each subscriber endpoint. */
export type SubscriptionPayload = {
  type: string;
  siteId: string;
  contentType: string;
  slug: string;
  id: string;
  at: string;
};

type DeliverDependencies = {
  fetch: typeof globalThis.fetch;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
  warn: (message: string, error?: unknown) => void;
};

const defaults: DeliverDependencies = {
  fetch: globalThis.fetch,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => new Date(),
  warn: (message, error) => console.warn(message, error),
};

/**
 * Delivers one webhook event to a single subscriber URL.
 *
 * Attempts the POST twice (one retry on any non-2xx or network error) with a
 * 2-second pause between attempts and a 5-second timeout per attempt.  On both
 * attempts failing the function resolves — never rejects — so a delivery
 * failure cannot propagate back to the editor's save response.
 *
 * Returns the status of the final attempt so the caller can persist
 * `lastDelivery` on the subscription document.
 */
export async function deliverSubscriptionWebhook(
  subscription: Pick<IWebhookSubscription, '_id' | 'url'> & { secret: string },
  payload: SubscriptionPayload,
  dependencies: Partial<DeliverDependencies> = {},
): Promise<{ status: 'success' | 'failed'; statusCode: number }> {
  const deps = { ...defaults, ...dependencies };
  const at = deps.now();
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(at.getTime() / 1_000));
  const signature = signWebhookPayload(subscription.secret, timestamp, rawBody);

  let lastStatusCode = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await deps.fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CMS-Event': payload.type,
          'X-CMS-Timestamp': timestamp,
          'X-CMS-Signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(SUBSCRIPTION_TIMEOUT_MS),
      });
      lastStatusCode = response.status;
      if (response.ok) return { status: 'success', statusCode: response.status };
    } catch (error) {
      lastStatusCode = 0;
      deps.warn('[cms] subscription webhook attempt failed', error);
    }
    if (attempt === 0) await deps.sleep(SUBSCRIPTION_RETRY_DELAY_MS);
  }

  deps.warn('[cms] subscription webhook delivery failed after retry', { url: subscription.url });
  return { status: 'failed', statusCode: lastStatusCode };
}
