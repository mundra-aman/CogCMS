import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, revokeApiKey } from '@/lib/auth/api-key';
import { toErrorResponse } from '@/lib/http/errors';
export const dynamic = 'force-dynamic';
// Self-revocation must work even if the selected website was later disabled.
export async function POST(req: NextRequest) {
  let response: NextResponse;
  try {
    const auth = await authenticateApiKey(req, 'publishing:connect');
    await revokeApiKey(auth.keyId);
    response = NextResponse.json({ revoked: true });
  } catch (error) {
    response = toErrorResponse(error);
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
