import NewsletterSubscriber from '@/models/NewsletterSubscriber';
import { newsletterResponseSchema } from '@/contracts/v1/intake';
import { checkIntakeRateLimit } from '@/lib/auth/rate-limit';
import { apiJson, withApiKey } from '@/lib/http/api-handler';
import { readJson } from '@/lib/http/admin-handler';
import { rateLimited, validationError } from '@/lib/http/errors';
import { newsletterSubscriberInputSchema } from '@/lib/validation/newsletter-subscriber';

export const dynamic = 'force-dynamic';

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

export const POST = withApiKey('intake:write', async (req, { auth }) => {
  const limit = await checkIntakeRateLimit(req.headers, auth.keyId);
  if (limit.limited) throw rateLimited(limit.retryAfter);
  const parsed = newsletterSubscriberInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten());
  const now = new Date();
  const filter = { siteId: auth.siteId, email: parsed.data.email };
  let isNew = false;
  const updated = await NewsletterSubscriber.updateOne(filter, {
    $set: { source: parsed.data.source, lastSubscribedAt: now, updatedBy: null },
    $inc: { submitCount: 1 },
  }).exec();
  if (updated.matchedCount === 0) {
    try {
      await NewsletterSubscriber.create({
        ...filter,
        source: parsed.data.source,
        submitCount: 1,
        firstSubscribedAt: now,
        lastSubscribedAt: now,
        createdBy: null,
        updatedBy: null,
      });
      isNew = true;
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      await NewsletterSubscriber.updateOne(filter, {
        $set: { source: parsed.data.source, lastSubscribedAt: now, updatedBy: null },
        $inc: { submitCount: 1 },
      }).exec();
    }
  }
  return apiJson(
    req,
    newsletterResponseSchema,
    { data: { subscribed: true, new: isNew } },
    { status: isNew ? 201 : 200 },
  );
});
