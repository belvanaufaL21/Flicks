import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validatePhoto } from '../../src/server/photo/validate-photo';

async function createImage(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' = 'png',
) {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 90, b: 160 },
    },
  });

  return format === 'jpeg'
    ? image.jpeg().toBuffer()
    : format === 'webp'
      ? image.webp().toBuffer()
      : image.png().toBuffer();
}

describe('validatePhoto', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('accepts a readable %s image within approved limits', async (format, mimeType) => {
    const bytes = await createImage(512, 768, format);

    await expect(
      validatePhoto({ bytes, declaredMimeType: mimeType }),
    ).resolves.toMatchObject({
      ok: true,
      bytes,
      mimeType,
      width: 512,
      height: 768,
      sizeBytes: bytes.length,
    });
  });

  it('rejects formats outside JPEG, PNG, and WebP', async () => {
    const bytes = await createImage(512, 768);

    await expect(
      validatePhoto({ bytes, declaredMimeType: 'image/gif' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'unsupported_type',
    });
  });

  it('rejects a declared MIME type that does not match the image data', async () => {
    const bytes = await createImage(512, 768, 'png');

    await expect(
      validatePhoto({ bytes, declaredMimeType: 'image/jpeg' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'mime_mismatch',
    });
  });

  it('rejects files larger than 10 MB before decoding', async () => {
    const bytes = Buffer.alloc(10_000_001);

    await expect(
      validatePhoto({ bytes, declaredMimeType: 'image/png' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'file_too_large',
    });
  });

  it('rejects images with a side shorter than 512 pixels', async () => {
    const bytes = await createImage(511, 768);

    await expect(
      validatePhoto({ bytes, declaredMimeType: 'image/png' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'dimensions_out_of_range',
    });
  });

  it('rejects images with a side longer than 4096 pixels', async () => {
    const bytes = await createImage(4097, 512);

    await expect(
      validatePhoto({ bytes, declaredMimeType: 'image/png' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'dimensions_out_of_range',
    });
  });

  it('rejects unreadable image data', async () => {
    await expect(
      validatePhoto({
        bytes: Buffer.from('not an image'),
        declaredMimeType: 'image/png',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'unreadable_image',
    });
  });
});
