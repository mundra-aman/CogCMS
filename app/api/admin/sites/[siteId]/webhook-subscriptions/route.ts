import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { createWebhookSubscriptionSchema } from '@/lib/validation/webhook-subscription';
import WebhookSubscription from '@/models/WebhookSubscription';
import Site from '@/models/Site';

export const dynamic = 'force-dynamic';

function assertSiteId(siteId: string): void {
  if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
    throw validationError({ siteId: ['Invalid site id'] });
  }
}

/**
 * Lists all webhook subscriptions for a site.
 * Secrets are never included — they are stored with select:false.
 */
export const GET = withAdmin<{ siteId: string }>(
  async (_req, { params }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    await connectToDatabase();
    if (!(await Site.exists({ _id: siteId }))) throw notFound('Site');
    const subscriptions = await WebhookSubscription.find({ siteId })
      .sort({ createdAt: -1 })
      .exec();
    return NextResponse.json(subscriptions);
  },
  { admin: true, site: false },
);

/**
 * Creates a new webhook subscription.
 * Generates and returns the signing secret exactly once — it is not stored in
 * plaintext again after this response.
 */
export const POST = withAdmin<{ siteId: string }>(
  async (req, { params }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    const parsed = createWebhookSubscriptionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid webhook subscription payload');
    await connectToDatabase();
    if (!(await Site.exists({ _id: siteId }))) throw notFound('Site');

    const secret = randomBytes(32).toString('base64url');
    const subscription = await WebhookSubscription.create({
      siteId,
      url: parsed.data.url,
      events: parsed.data.events,
      secret,
      active: true,
    });

    const subscriptionObject = subscription.toObject();
    delete (subscriptionObject as { secret?: string }).secret;

    // Return the secret inline with the subscription document — only time it's visible.
    return NextResponse.json(
      { subscription: subscriptionObject, secret },
      { status: 201 },
    );
  },
  { admin: true, site: false },
);
