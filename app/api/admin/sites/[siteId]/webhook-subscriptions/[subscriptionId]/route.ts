import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { updateWebhookSubscriptionSchema } from '@/lib/validation/webhook-subscription';
import WebhookSubscription from '@/models/WebhookSubscription';

export const dynamic = 'force-dynamic';
type Params = { siteId: string; subscriptionId: string };

function assertIds(siteId: string, subscriptionId: string): void {
  if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
    throw validationError({ siteId: ['Invalid site id'] });
  }
  if (!/^[a-f\d]{24}$/i.test(subscriptionId) || !Types.ObjectId.isValid(subscriptionId)) {
    throw validationError({ subscriptionId: ['Invalid subscription id'] });
  }
}

/**
 * Updates url, events, or active status of an existing webhook subscription.
 * Never returns or accepts a new secret.
 */
export const PATCH = withAdmin<Params>(
  async (req, { params }) => {
    const { siteId, subscriptionId } = await params;
    assertIds(siteId, subscriptionId);
    const parsed = updateWebhookSubscriptionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid update payload');
    await connectToDatabase();
    const subscription = await WebhookSubscription.findOneAndUpdate(
      { _id: subscriptionId, siteId },
      { $set: parsed.data },
      { returnDocument: 'after', runValidators: true },
    ).exec();
    if (!subscription) throw notFound('Webhook subscription');
    return NextResponse.json(subscription);
  },
  { admin: true, site: false },
);

/** Permanently removes a webhook subscription. */
export const DELETE = withAdmin<Params>(
  async (_req, { params }) => {
    const { siteId, subscriptionId } = await params;
    assertIds(siteId, subscriptionId);
    await connectToDatabase();
    const subscription = await WebhookSubscription.findOneAndDelete({
      _id: subscriptionId,
      siteId,
    }).exec();
    if (!subscription) throw notFound('Webhook subscription');
    return NextResponse.json({ message: 'Deleted successfully' });
  },
  { admin: true, site: false },
);
