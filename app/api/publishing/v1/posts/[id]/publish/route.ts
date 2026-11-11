import { withPublishingKey } from '@/lib/publishing/posts';
import { publishScheduledPost } from '@/lib/publishing/scheduled';
export const dynamic = 'force-dynamic';
export const POST = withPublishingKey(publishScheduledPost);
