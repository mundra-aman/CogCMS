import { z } from 'zod';
import { WEBHOOK_SUBSCRIPTION_EVENTS } from '@/models/WebhookSubscription';

/**
 * Validates the URL field for a webhook subscription.
 * Must be an https URL without credentials — mirrors the site-level webhookUrl
 * constraint but requires https (not just http/https) because subscriptions fire
 * to external consumer endpoints.
 */
const webhookSubscriptionUrl = z
  .string()
  .trim()
  .url()
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Must be a valid URL' });
      return;
    }
    if (url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Webhook URL must use https' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'Webhook URL cannot contain credentials' });
    }
  });

const webhookSubscriptionEventSchema = z.enum(WEBHOOK_SUBSCRIPTION_EVENTS);

/**
 * Input schema for creating a new webhook subscription.
 * The secret is generated server-side and is not accepted as input.
 */
export const createWebhookSubscriptionSchema = z
  .object({
    url: webhookSubscriptionUrl,
    events: z
      .array(webhookSubscriptionEventSchema)
      .min(1, 'Select at least one event')
      .refine((arr) => new Set(arr).size === arr.length, 'events must not contain duplicates'),
  })
  .strict();

/**
 * Input schema for updating an existing webhook subscription.
 * All fields are optional; at least one must be provided.
 */
export const updateWebhookSubscriptionSchema = z
  .object({
    url: webhookSubscriptionUrl.optional(),
    events: z
      .array(webhookSubscriptionEventSchema)
      .min(1, 'Select at least one event')
      .refine((arr) => new Set(arr).size === arr.length, 'events must not contain duplicates')
      .optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export type CreateWebhookSubscriptionInput = z.infer<typeof createWebhookSubscriptionSchema>;
export type UpdateWebhookSubscriptionInput = z.infer<typeof updateWebhookSubscriptionSchema>;
