import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validatePhotoFile } from '../../src/components/photo-intake/photo-file-validation';

const close = vi.fn();
const decode = vi.fn();

const MAGIC_HEADERS: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ],
};

function makeFile(
  type: string,
  size = 128,
  contentType = type,
): File {
  const bytes = new Uint8Array(size);
  const header = MAGIC_HEADERS[contentType];
  if (header && size >= header.length) {
    bytes.set(header, 0);
  }
  return new File([bytes], 'photo', { type });
}

describe('validatePhotoFile', () => {
  beforeEach(() => {
    decode.mockReset();
    close.mockReset();
    vi.stubGlobal('createImageBitmap', decode);
    decode.mockResolvedValue({ width: 512, height: 768, close });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts readable %s within dimension limits',
    async (type) => {
      await expect(validatePhotoFile(makeFile(type))).resolves.toEqual({
        ok: true,
        width: 512,
        height: 768,
      });
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('rejects unsupported MIME types without decoding', async () => {
    await expect(validatePhotoFile(makeFile('image/gif'))).resolves.toEqual({
      ok: false,
      code: 'unsupported_type',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects empty files without decoding', async () => {
    await expect(validatePhotoFile(makeFile('image/png', 0))).resolves.toEqual({
      ok: false,
      code: 'unreadable_image',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects declared MIME types that do not match actual file signature', async () => {
    await expect(
      validatePhotoFile(makeFile('image/jpeg', 128, 'image/png')),
    ).resolves.toEqual({
      ok: false,
      code: 'mime_mismatch',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects files above 10,000,000 bytes without decoding', async () => {
    await expect(
      validatePhotoFile(makeFile('image/png', 10_000_001)),
    ).resolves.toEqual({ ok: false, code: 'file_too_large' });
    expect(decode).not.toHaveBeenCalled();
  });

  it.each([
    [511, 768],
    [512, 4097],
  ])('rejects dimensions outside policy: %i x %i', async (width, height) => {
    decode.mockResolvedValueOnce({ width, height, close });
    await expect(validatePhotoFile(makeFile('image/png'))).resolves.toEqual({
      ok: false,
      code: 'dimensions_out_of_range',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('accepts the maximum dimension and minimum side', async () => {
    decode.mockResolvedValueOnce({ width: 512, height: 4096, close });
    await expect(validatePhotoFile(makeFile('image/png'))).resolves.toEqual({
      ok: true,
      width: 512,
      height: 4096,
    });
  });

  it('rejects images that the browser cannot decode', async () => {
    decode.mockRejectedValueOnce(new Error('decode failed'));
    await expect(validatePhotoFile(makeFile('image/png'))).resolves.toEqual({
      ok: false,
      code: 'unreadable_image',
    });
  });
});
