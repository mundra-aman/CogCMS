import { createHmac } from 'node:crypto';

/**
 * Signs a raw JSON body string using HMAC-SHA256, producing the value for the
 * X-CMS-Signature header.  The signing format — `${timestamp}.${body}` — is
 * intentionally identical to the site-level webhook in lib/webhook.ts so that
 * consumers can use a single verification helper regardless of the delivery path.
 */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const hex = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `sha256=${hex}`;
}
