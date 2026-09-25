type UploadGrant = { url: string; fields: Record<string, string>; ticket: string };

async function cmsJson(
  path: string,
  body: unknown,
  siteId: string,
  fallback: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cms-site': siteId },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(fallback);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : fallback);
  return payload;
}

function uploadGrant(value: unknown): UploadGrant {
  const grant = value as Partial<UploadGrant> | null;
  try {
    if (
      !grant ||
      typeof grant.url !== 'string' ||
      typeof grant.ticket !== 'string' ||
      !grant.fields ||
      Array.isArray(grant.fields) ||
      typeof grant.fields !== 'object' ||
      Object.values(grant.fields).some((value) => typeof value !== 'string')
    )
      throw new Error();
    const url = new URL(grant.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^[a-z0-9][a-z0-9.-]*\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) ||
      url.pathname !== '/'
    )
      throw new Error();
    return grant as UploadGrant;
  } catch {
    throw new Error('Invalid upload response');
  }
}

/** The only image request body goes directly to S3; both CMS requests are small JSON. */
export async function uploadImageDirect(file: File, siteId: string): Promise<string> {
  const grant = uploadGrant(
    await cmsJson(
      '/api/admin/upload',
      { contentType: file.type, size: file.size },
      siteId,
      'Unable to prepare image upload',
    ),
  );
  const form = new FormData();
  for (const [name, value] of Object.entries(grant.fields)) form.append(name, value);
  form.append('file', file); // S3 POST requires the file field last.
  try {
    const response = await fetch(grant.url, {
      method: 'POST',
      body: form,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error();
  } catch {
    throw new Error('Image transfer failed. Please retry the upload.');
  }
  const result = (await cmsJson(
    '/api/admin/upload/complete',
    { ticket: grant.ticket },
    siteId,
    'Unable to complete image upload',
  )) as { url?: unknown } | null;
  if (typeof result?.url !== 'string' || !/^https?:\/\//.test(result.url))
    throw new Error('Upload completed but no file URL was returned');
  return result.url;
}
