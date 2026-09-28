/**
 * The complete set of event names the webhook fan-out system can emit.
 * These match the WebhookEventType values produced by lib/webhook.ts so that
 * subscriptions can filter on the exact strings already sent by the site-level hook.
 */
export const WEBHOOK_SUBSCRIPTION_EVENTS = [
  'content.published',
  'content.updated',
  'content.unpublished',
  'content.deleted',
] as const;

export type WebhookSubscriptionEvent = (typeof WEBHOOK_SUBSCRIPTION_EVENTS)[number];
