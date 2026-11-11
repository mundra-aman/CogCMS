import { withPublishingKey } from '@/lib/publishing/posts';
import { getPublishingPost } from '@/lib/publishing/scheduled';
export const dynamic = 'force-dynamic';
export const GET = withPublishingKey(getPublishingPost);
