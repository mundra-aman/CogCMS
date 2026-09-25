import { describe, expect, it } from 'vitest';
import {
  CLIENT_UPLOAD_TARGET_BYTES,
  compressedFileFrom,
  shouldCompressOnClient,
} from './compress-output';

const big = CLIENT_UPLOAD_TARGET_BYTES + 1;

describe('shouldCompressOnClient', () => {
  it('never re-encodes formats the canvas cannot write (GIF, WebP, AVIF)', () => {
    for (const type of ['image/gif', 'image/webp', 'image/avif']) {
      expect(shouldCompressOnClient({ type, size: big })).toBe(false);
    }
  });

  it('re-encodes only oversized JPEG and PNG', () => {
    expect(shouldCompressOnClient({ type: 'image/jpeg', size: big })).toBe(true);
    expect(shouldCompressOnClient({ type: 'image/png', size: big })).toBe(true);
    expect(shouldCompressOnClient({ type: 'image/jpeg', size: CLIENT_UPLOAD_TARGET_BYTES })).toBe(
      false,
    );
  });
});

describe('compressedFileFrom', () => {
  it('labels the file with the bytes the encoder actually produced, not the requested type', () => {
    // A browser that cannot encode the requested type silently returns PNG.
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const file = compressedFileFrom(blob, 'image/jpeg', 'banner.gif');
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('banner.png');
  });

  it('uses the requested type and a matching extension when the encoder honoured it', () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    const file = compressedFileFrom(blob, 'image/jpeg', 'photo.PNG');
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('photo.jpg');
  });

  it('falls back to the requested type when the blob carries none', () => {
    const blob = new Blob([new Uint8Array([1])]);
    const file = compressedFileFrom(blob, 'image/jpeg', 'x.jpeg');
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('x.jpg');
  });
});
