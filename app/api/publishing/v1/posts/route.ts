import { withPublishingKey, listPublishingPosts, savePublishingPost } from '@/lib/publishing/posts';
export const dynamic = 'force-dynamic';
export const GET = withPublishingKey(listPublishingPosts);
export const POST = withPublishingKey(savePublishingPost);
