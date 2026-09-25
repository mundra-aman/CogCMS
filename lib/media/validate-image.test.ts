import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import { validateImage } from './validate-image';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==',
  'base64',
);
const corruptPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9e0AAAAASUVORK5CYII=',
  'base64',
);

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

/** Real APNG framing, valid CRCs, and one independently compressed image per frame. */
function apng(frames: number, corruptLastFrame = false): Buffer {
  const chunks: [string, Buffer][] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunks.push([
      png.toString('ascii', offset + 4, offset + 8),
      png.subarray(offset + 8, offset + 8 + length),
    ]);
    offset += length + 12;
  }
  const ihdr = chunks.find(([type]) => type === 'IHDR')![1];
  const compressed = Buffer.concat(
    chunks.filter(([type]) => type === 'IDAT').map(([, data]) => data),
  );
  const control = Buffer.alloc(8);
  control.writeUInt32BE(frames);
  const output = [png.subarray(0, 8), pngChunk('IHDR', ihdr), pngChunk('acTL', control)];
  let sequence = 0;
  for (let frame = 0; frame < frames; frame++) {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(sequence++);
    fc.writeUInt32BE(ihdr.readUInt32BE(0), 4);
    fc.writeUInt32BE(ihdr.readUInt32BE(4), 8);
    fc.writeUInt16BE(1, 20);
    fc.writeUInt16BE(10, 22);
    output.push(pngChunk('fcTL', fc));
    if (frame === 0) output.push(pngChunk('IDAT', compressed));
    else {
      const data = Buffer.alloc(4 + compressed.length);
      data.writeUInt32BE(sequence++);
      compressed.copy(data, 4);
      if (corruptLastFrame && frame === frames - 1) data[4] = 255;
      output.push(pngChunk('fdAT', data));
    }
  }
  output.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(output);
}

afterEach(() => vi.restoreAllMocks());
async function animation(pages: number): Promise<Buffer> {
  const pixels = Buffer.alloc(pages * 3);
  for (let i = 0; i < pages; i++) {
    pixels[i * 3] = i;
    pixels[i * 3 + 1] = 255 - i;
    pixels[i * 3 + 2] = i * 2;
  }
  return sharp(pixels, { raw: { width: 1, height: pages, channels: 3, pageHeight: 1 } })
    .gif({ keepDuplicateFrames: true, delay: Array(pages).fill(10) })
    .toBuffer();
}

describe('actual image validation', () => {
  it.each([
    { frames: 101, corrupt: false },
    { frames: 2, corrupt: true },
  ])('rejects unsupported APNG animation: %j', async ({ frames, corrupt }) => {
    const bytes = apng(frames, corrupt);
    const metadata = await sharp(bytes, { animated: true, failOn: 'warning' }).metadata();
    expect(metadata.pages).toBeUndefined(); // Sharp silently reads only the default PNG image.
    await expect(
      sharp(bytes, { animated: true, failOn: 'warning' }).raw().toBuffer(),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(validateImage(bytes, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it('accepts static PNG text containing the literal acTL without treating it as a chunk', async () => {
    const bytes = Buffer.concat([
      png.subarray(0, 33),
      pngChunk('tEXt', Buffer.from('Comment\0literal acTL text')),
      png.subarray(33),
    ]);
    await expect(validateImage(bytes, 'image/png')).resolves.toBeUndefined();
  });
  it.each(['oversized-length', 'truncated-chunk', 'missing-end'] as const)(
    'rejects malformed PNG chunk bounds: %s',
    async (failure) => {
      let bytes = Buffer.from(png);
      if (failure === 'oversized-length') bytes.writeUInt32BE(0xffffffff, 8);
      else bytes = bytes.subarray(0, bytes.length - (failure === 'missing-end' ? 12 : 3));
      await expect(validateImage(bytes, 'image/png')).rejects.toMatchObject({ status: 400 });
    },
  );
  it.each(['jpeg', 'png', 'webp', 'gif', 'avif'] as const)(
    'fully decodes a valid %s without changing original bytes',
    async (format) => {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const original = Buffer.from(bytes);
      if (format === 'avif')
        expect(await sharp(bytes).metadata()).toMatchObject({ format: 'heif', compression: 'av1' });
      await expect(validateImage(bytes, `image/${format}`)).resolves.toBeUndefined();
      expect(bytes.equals(original)).toBe(true);
    },
  );
  it.each(['image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml', 'text/html'])(
    'rejects PNG bytes claimed as %s',
    async (type) => {
      await expect(validateImage(png, type)).rejects.toMatchObject({ status: 400 });
    },
  );
  it.each([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'),
    Buffer.from('<html>not an image</html>'),
    Buffer.alloc(0),
    Buffer.alloc(10 * 1024 * 1024 + 1),
  ])('rejects unsupported or out-of-bounds input', async (bytes) => {
    await expect(validateImage(bytes, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it('rejects corrupt pixels even when the PNG header and metadata are valid', async () => {
    expect(await sharp(corruptPng).metadata()).toMatchObject({
      format: 'png',
      width: 1,
      height: 1,
    });
    await expect(validateImage(corruptPng, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a truncated JPEG', async () => {
    const bytes = await sharp(png).jpeg().toBuffer();
    const truncated = bytes.subarray(0, bytes.length - 10);
    await expect(validateImage(truncated, 'image/jpeg')).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a corrupt third GIF frame that first-frame-only decoding misses', async () => {
    const bytes = Buffer.from(
      '4749463839610c0001008300004c69712e4d6c8baac9e807267493b2173655bad9f85d7c9b001f3eff1e3da2c1e0456483d1f00f00000000000000000021ff0b4e45545343415045322e30030100000021f90405010000002c000000000c000100000409101d53080b622c95220021f90405010000002c000000000c000100000409f09842581063a974220021f90405010000002c000000000c000100000409d014c282184ba56322003b',
      'hex',
    );
    bytes[160] = 255; // Corrupt the third frame's LZW payload, preserving all headers.
    expect(await sharp(bytes, { animated: true }).metadata()).toMatchObject({ pages: 3 });
    await expect(sharp(bytes, { failOn: 'warning' }).raw().toBuffer()).resolves.toBeInstanceOf(
      Buffer,
    );
    await expect(validateImage(bytes, 'image/gif')).rejects.toMatchObject({ status: 400 });
  });
  it('accepts all 100 frames but rejects 101 frames', async () => {
    const accepted = await animation(100);
    const rejected = await animation(101);
    expect(await sharp(accepted, { animated: true }).metadata()).toMatchObject({
      pages: 100,
      height: 100,
      pageHeight: 1,
    });
    expect(await sharp(rejected, { animated: true }).metadata()).toMatchObject({ pages: 101 });
    await expect(validateImage(accepted, 'image/gif')).resolves.toBeUndefined();
    await expect(validateImage(rejected, 'image/gif')).rejects.toMatchObject({ status: 400 });
  });
  it('rejects an image exceeding 16 million pixels despite a small encoded file', async () => {
    const bytes = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
    await expect(validateImage(bytes, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it('caps aggregate animation pixels, not just individual frame dimensions', async () => {
    const bytes = await sharp({
      create: { width: 4001, height: 4000, pageHeight: 2000, channels: 3, background: 'red' },
    })
      .gif({ keepDuplicateFrames: true, delay: [10, 10] })
      .toBuffer();
    expect(await sharp(bytes, { animated: true }).metadata()).toMatchObject({
      pages: 2,
      width: 4001,
      height: 4000,
      pageHeight: 2000,
    });
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
    await expect(validateImage(bytes, 'image/gif')).rejects.toMatchObject({ status: 400 });
  });
  it('applies the native processing timeout to real decoding', async () => {
    const timeout = vi.spyOn(sharp.prototype, 'timeout');
    await validateImage(png, 'image/png');
    expect(timeout).toHaveBeenCalledWith({ seconds: 10 });
  });
});
