import { withPublishingKey } from '@/lib/publishing/posts';
import { reschedulePost } from '@/lib/publishing/scheduled';
export const dynamic = 'force-dynamic';
export const PUT = withPublishingKey(reschedulePost);
