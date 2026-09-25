import FAQSubmission from '@/models/FAQSubmission';
import { faqSubmissionResponseSchema } from '@/contracts/v1/intake';
import { checkIntakeRateLimit } from '@/lib/auth/rate-limit';
import { apiJson, withApiKey } from '@/lib/http/api-handler';
import { readJson } from '@/lib/http/admin-handler';
import { rateLimited, validationError } from '@/lib/http/errors';
import { publicFaqSubmissionSchema } from '@/lib/validation/faq-submission';

export const dynamic = 'force-dynamic';

export const POST = withApiKey('intake:write', async (req, { auth }) => {
  const limit = await checkIntakeRateLimit(req.headers, auth.keyId);
  if (limit.limited) throw rateLimited(limit.retryAfter);
  const parsed = publicFaqSubmissionSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten());
  const submission = await FAQSubmission.create({
    siteId: auth.siteId,
    ...parsed.data,
    status: 'pending',
    createdBy: null,
    updatedBy: null,
  });
  return apiJson(
    req,
    faqSubmissionResponseSchema,
    { data: { id: submission._id.toString(), status: 'pending' } },
    { status: 201 },
  );
});
