import { afterEach, describe, expect, it, vi } from 'vitest';

const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });
const grant = {
  url: 'https://cms-media-test.s3.ap-south-1.amazonaws.com/',
  fields: { key: 'staging/test/image', Policy: 'signed' },
  ticket: 'intent',
};
const finalUrl = 'https://media.example/sites/test/image.png';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe('browser direct upload', () => {
  it('sends JSON to CMS, file directly to S3, then JSON completion with the same site', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(grant, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ url: finalUrl }, 201));
    vi.stubGlobal('fetch', fetch);
    const { uploadImageDirect } = await import('./upload-client');
    await expect(uploadImageDirect(file, 'site-a')).resolves.toBe(finalUrl);
    const [sign, storage, complete] = fetch.mock.calls;
    expect(sign[0]).toBe('/api/admin/upload');
    expect(JSON.parse(sign[1].body)).toEqual({ contentType: file.type, size: file.size });
    expect(sign[1].headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-cms-site': 'site-a',
    });
    expect(storage[0]).toBe(grant.url);
    expect(storage[1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(storage[1].body).toBeInstanceOf(FormData);
    expect(storage[1].body.get('file')).toBe(file);
    expect([...storage[1].body.keys()]).toEqual(['key', 'Policy', 'file']);
    expect(complete[0]).toBe('/api/admin/upload/complete');
    expect(JSON.parse(complete[1].body)).toEqual({ ticket: 'intent' });
    expect(complete[1].headers['x-cms-site']).toBe('site-a');
  });
  it.each(['sign', 'storage', 'completion'])(
    'shows a %s failure and stops the flow',
    async (step) => {
      const fetch = vi.fn();
      fetch.mockResolvedValueOnce(
        step === 'sign' ? json({ error: 'Sign denied' }, 403) : json(grant),
      );
      fetch.mockResolvedValueOnce(
        step === 'storage'
          ? new Response('credential-looking S3 XML', { status: 403 })
          : new Response(null, { status: 204 }),
      );
      fetch.mockResolvedValueOnce(json({ error: 'Completion denied' }, 400));
      vi.stubGlobal('fetch', fetch);
      const { uploadImageDirect } = await import('./upload-client');
      await expect(uploadImageDirect(file, 'site-a')).rejects.toThrow(
        step === 'sign'
          ? 'Sign denied'
          : step === 'storage'
            ? 'Image transfer failed'
            : 'Completion denied',
      );
      expect(fetch).toHaveBeenCalledTimes(step === 'sign' ? 1 : step === 'storage' ? 2 : 3);
    },
  );
  it('shows network failure without leaking storage error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(grant))
        .mockRejectedValueOnce(new Error('sensitive endpoint')),
    );
    const { uploadImageDirect } = await import('./upload-client');
    await expect(uploadImageDirect(file, 'site-a')).rejects.toThrow('Image transfer failed');
  });
  it('does not send a file to an arbitrary or insecure storage origin', async () => {
    for (const url of [
      'https://evil.example/',
      'http://bucket.s3.ap-south-1.amazonaws.com/',
      'https://bucket.s3.ap-south-1.amazonaws.com.evil.example/',
    ]) {
      const fetch = vi.fn().mockResolvedValueOnce(json({ ...grant, url }));
      vi.stubGlobal('fetch', fetch);
      const { uploadImageDirect } = await import('./upload-client');
      await expect(uploadImageDirect(file, 'site-a')).rejects.toThrow('Invalid upload response');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
