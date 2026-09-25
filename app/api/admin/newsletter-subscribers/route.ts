import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import NewsletterSubscriber from '@/models/NewsletterSubscriber';
import { withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';

const CSV_COLUMNS = [
  'email',
  'source',
  'submitCount',
  'firstSubscribedAt',
  'lastSubscribedAt',
] as const;

function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = withAdmin(async (req, { site }) => {
  await connectToDatabase();
  const subscribers = await NewsletterSubscriber.find({ siteId: site.id })
    .sort({ lastSubscribedAt: -1, _id: -1 })
    .exec();

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const rows = subscribers.map((subscriber) =>
      CSV_COLUMNS.map((column) => csvCell(subscriber[column])).join(','),
    );
    const csv = `${CSV_COLUMNS.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${site.slug}-subscribers.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(subscribers);
});
