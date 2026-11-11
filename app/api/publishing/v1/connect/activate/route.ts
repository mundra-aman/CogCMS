import { activateConnection, withConnectionKey } from '@/lib/publishing/connect';
export const dynamic = 'force-dynamic';
export const POST = withConnectionKey(activateConnection);
