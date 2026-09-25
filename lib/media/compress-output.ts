/** Above this size the editor re-encodes JPEG/PNG in the browser before the direct S3 upload. */
export const CLIENT_UPLOAD_TARGET_BYTES = 900 * 1024;

/** Canvas output type: every browser can encode JPEG; PNG is converted to JPEG to hit the target. */
export const CLIENT_UPLOAD_OUTPUT_TYPE = 'image/jpeg';

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * Only oversized JPEG and PNG are re-encoded client-side. GIF, WebP and AVIF go up untouched:
 * a canvas keeps just the first frame of an animation, and browsers that cannot encode the
 * requested type silently return PNG bytes, which the server then rejects as a MIME mismatch.
 * The server still enforces its own 10 MiB and decoding limits on the original bytes.
 */
export function shouldCompressOnClient(file: { type: string; size: number }): boolean {
  if (file.size <= CLIENT_UPLOAD_TARGET_BYTES) return false;
  return file.type === 'image/jpeg' || file.type === 'image/png';
}

/**
 * Wrap encoder output in a File whose declared type and extension follow the bytes the
 * encoder actually produced (`blob.type`), never merely the type that was requested.
 */
export function compressedFileFrom(blob: Blob, requestedType: string, originalName: string): File {
  const type = blob.type || requestedType;
  const extension = EXTENSION_BY_TYPE[type] ?? 'bin';
  const name = originalName.replace(/\.[^.]+$/, '') + `.${extension}`;
  return new File([blob], name, { type, lastModified: Date.now() });
}
