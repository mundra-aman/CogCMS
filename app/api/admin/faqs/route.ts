import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import FAQ from '@/models/FAQ';
import { faqInputSchema } from '@/lib/validation/faq';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { notifySiteWebhook } from '@/lib/webhook';
import { dispatchSubscriptionWebhooks } from '@/lib/webhooks/dispatch';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const faqs = await FAQ.find({ siteId: site.id }).sort({ category: 1, order: 1 }).exec();
  return NextResponse.json(faqs);
});

export const POST = withAdmin(async (req, { user, site }) => {
  const parsed = faqInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid FAQ payload');
  const data = parsed.data;
  const status = data.status ?? 'publish';
  const category = data.category || 'General';
  await connectToDatabase();
  const highest = await FAQ.findOne({ siteId: site.id })
    .sort({ order: -1 })
    .select({ order: 1 })
    .exec();
  const faq = await FAQ.create({
    question: data.question,
    answer: data.answer,
    category,
    order: data.order ?? (highest ? highest.order + 1 : 0),
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    siteId: site.id,
    createdBy: user.id,
    updatedBy: user.id,
  });
  if (faq.status === 'publish') {
    const webhookEvent = {
      type: 'content.published' as const,
      contentType: 'faq' as const,
      slug: faq._id.toString(),
      id: faq._id.toString(),
    };
    notifySiteWebhook(site.id, webhookEvent);
    dispatchSubscriptionWebhooks(site.id, webhookEvent);
  }
  return NextResponse.json(faq, { status: 201 });
});
