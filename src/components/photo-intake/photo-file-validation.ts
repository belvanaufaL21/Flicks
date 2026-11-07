import {
  PHOTO_POLICY,
  isSupportedPhotoMimeType,
  type SupportedPhotoMimeType,
} from '@/shared/photo-policy';

export type PhotoFileValidationResult =
  | { ok: true; width: number; height: number }
  | {
      ok: false;
      code:
        | 'unsupported_type'
        | 'mime_mismatch'
        | 'file_too_large'
        | 'dimensions_out_of_range'
        | 'unreadable_image';
    };

function detectPhotoMimeType(
  bytes: Uint8Array,
): SupportedPhotoMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

async function readHeaderBytes(file: File, length: number): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  return new Uint8Array(await new Response(slice).arrayBuffer());
}

export async function validatePhotoFile(
  file: File,
): Promise<PhotoFileValidationResult> {
  if (!isSupportedPhotoMimeType(file.type)) {
    return { ok: false, code: 'unsupported_type' };
  }

  if (file.size === 0) {
    return { ok: false, code: 'unreadable_image' };
  }

  if (file.size > PHOTO_POLICY.maxBytes) {
    return { ok: false, code: 'file_too_large' };
  }

  let detectedMimeType: SupportedPhotoMimeType | null;
  try {
    detectedMimeType = detectPhotoMimeType(await readHeaderBytes(file, 12));
  } catch {
    return { ok: false, code: 'unreadable_image' };
  }

  if (!detectedMimeType) {
    return { ok: false, code: 'unreadable_image' };
  }

  if (detectedMimeType !== file.type) {
    return { ok: false, code: 'mime_mismatch' };
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    return { ok: false, code: 'unreadable_image' };
  }

  const { width, height } = image;
  image.close();

  if (
    Math.min(width, height) < PHOTO_POLICY.minSidePx ||
    Math.max(width, height) > PHOTO_POLICY.maxSidePx
  ) {
    return { ok: false, code: 'dimensions_out_of_range' };
  }

  return { ok: true, width, height };
}
