import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require';
import { HttpError } from '@/lib/http/errors';
import { parseConnectionRequest } from '@/lib/publishing/connect';
import { getAccessibleSites } from '@/lib/site/context';
import Consent from './consent';
export const dynamic = 'force-dynamic';
export default async function ConnectStudio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let request;
  try {
    request = parseConnectionRequest(params);
  } catch {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Connection request unavailable</h1>
        <p className="mt-3">Return to Content Studio and start Connect CMS again.</p>
      </main>
    );
  }
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      const returnTo = '/connect/content-studio?' + new URLSearchParams(request).toString();
      redirect('/admin/login?returnTo=' + encodeURIComponent(returnTo));
    }
    if (error instanceof HttpError && error.status === 403)
      return (
        <main className="mx-auto max-w-lg p-8">
          <h1 className="text-xl font-semibold">CMS administrator access required</h1>
          <p className="mt-3">Ask your CMS administrator to connect this website.</p>
        </main>
      );
    throw error;
  }
  const sites = await getAccessibleSites(user);
  return (
    <Consent
      request={request}
      sites={sites.map((s) => ({ id: s.id, name: s.name, domain: s.primaryDomain }))}
    />
  );
}
