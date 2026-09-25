import sharp from 'sharp';
import { validationError } from '@/lib/http/errors';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_FRAMES = 100;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const FORMATS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'heif',
};

/** Sharp only decodes APNG's default image. Reject animation at PNG chunk boundaries. */
function requireStaticPng(bytes: Buffer): void {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return;
  let offset = 8;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw validationError(null, 'Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12)
      throw validationError(null, 'Invalid PNG chunk length');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL')
      throw validationError(null, 'Animated PNG is not supported; use GIF or WebP');
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length)
        throw validationError(null, 'Invalid PNG ending');
      return;
    }
  }
  throw validationError(null, 'PNG ending is missing');
}

/** Decode every frame for validation; completion still publishes the original buffer. */
export async function validateImage(bytes: Buffer, contentType: string): Promise<void> {
  const format = FORMATS[contentType];
  if (!format || bytes.length === 0 || bytes.length > MAX_BYTES) {
    throw validationError(null, 'Choose a supported image between 1 byte and 10 MiB');
  }
  requireStaticPng(bytes);
  const decoder = sharp(bytes, {
    animated: true,
    failOn: 'warning',
    unlimited: false,
    limitInputPixels: MAX_PIXELS,
  });
  try {
    const metadata = await decoder.metadata();
    const frames = metadata.pages ?? 1;
    // With animated:true, height includes every vertically stacked frame.
    const pixels = metadata.width * metadata.height;
    if (
      metadata.format !== format ||
      (contentType === 'image/avif' && metadata.compression !== 'av1') ||
      !Number.isSafeInteger(frames) ||
      frames < 1 ||
      frames > MAX_FRAMES ||
      !Number.isSafeInteger(pixels) ||
      pixels < 1 ||
      pixels > MAX_PIXELS
    ) {
      throw new Error('Unsupported image format or dimensions');
    }
    // Raw output forces pixel decoding, including later animation frames. The native
    // timeout excludes time queued for libuv; it is not a whole-request deadline.
    await decoder.timeout({ seconds: 10 }).raw({ depth: 'uchar' }).toBuffer();
  } catch {
    throw validationError(null, 'Image is invalid, unsupported, or exceeds the decoding limits');
  } finally {
    decoder.destroy();
  }
}
