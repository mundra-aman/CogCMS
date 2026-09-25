import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import FAQSubmission, { type FAQSubmissionStatus } from '@/models/FAQSubmission';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { faqSubmissionUpdateSchema } from '@/lib/validation/faq-submission';

export const dynamic = 'force-dynamic';
type Params = { id: string };

function validId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function submissionStatus(raw: unknown): FAQSubmissionStatus {
  const parsed = faqSubmissionUpdateSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid submission status');
  return parsed.data.status;
}

export const PATCH = withAdmin<Params>(async (req, { params, user, site }) => {
  const { id } = await params;
  if (!validId(id)) throw notFound('Submission');
  const status = submissionStatus(await readJson(req));
  await connectToDatabase();
  const submission = await FAQSubmission.findOneAndUpdate(
    { _id: id, siteId: site.id },
    { $set: { status, updatedBy: user.id } },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!submission) throw notFound('Submission');
  return NextResponse.json(submission);
});

export const DELETE = withAdmin<Params>(async (_req, { params, site }) => {
  const { id } = await params;
  if (!validId(id)) throw notFound('Submission');
  await connectToDatabase();
  const submission = await FAQSubmission.findOneAndDelete({ _id: id, siteId: site.id }).exec();
  if (!submission) throw notFound('Submission');
  return NextResponse.json({ message: 'Deleted successfully' });
});
