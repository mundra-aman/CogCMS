import { NextResponse } from 'next/server';
import connectToDatabase, { isDatabaseConnected } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  try {
    await connectToDatabase();
    db = isDatabaseConnected();
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: true, db }, { status: db ? 200 : 503 });
}
