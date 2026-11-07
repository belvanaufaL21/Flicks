import sharp from 'sharp';
import {
  isSupportedPhotoMimeType,
  PHOTO_POLICY,
  type SupportedPhotoMimeType,
} from '@/shared/photo-policy';

const mimeToFormat = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

type PhotoValidationErrorCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'mime_mismatch'
  | 'dimensions_out_of_range'
  | 'unreadable_image';

export interface ValidatedPhoto {
  ok: true;
  bytes: Uint8Array;
  mimeType: SupportedPhotoMimeType;
  width: number;
  height: number;
  sizeBytes: number;
}

export type PhotoValidationResult =
  | ValidatedPhoto
  | {
      ok: false;
      code: PhotoValidationErrorCode;
    };

interface PhotoInput {
  bytes: Uint8Array;
  declaredMimeType: string;
}

export async function validatePhoto({
  bytes,
  declaredMimeType,
}: PhotoInput): Promise<PhotoValidationResult> {
  if (!isSupportedPhotoMimeType(declaredMimeType)) {
    return { ok: false, code: 'unsupported_type' };
  }

  if (bytes.byteLength > PHOTO_POLICY.maxBytes) {
    return { ok: false, code: 'file_too_large' };
  }

  const mimeType = declaredMimeType;
  const image = sharp(Buffer.from(bytes), {
    limitInputPixels: PHOTO_POLICY.maxSidePx * PHOTO_POLICY.maxSidePx,
  });

  let metadata: sharp.Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    return { ok: false, code: 'unreadable_image' };
  }

  if (metadata.format !== mimeToFormat[mimeType]) {
    return { ok: false, code: 'mime_mismatch' };
  }

  if (!metadata.width || !metadata.height) {
    return { ok: false, code: 'unreadable_image' };
  }

  const isRotated = [5, 6, 7, 8].includes(metadata.orientation ?? 0);
  const width = isRotated ? metadata.height : metadata.width;
  const height = isRotated ? metadata.width : metadata.height;
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  if (
    shortestSide < PHOTO_POLICY.minSidePx ||
    longestSide > PHOTO_POLICY.maxSidePx
  ) {
    return { ok: false, code: 'dimensions_out_of_range' };
  }

  try {
    await image.stats();
  } catch {
    return { ok: false, code: 'unreadable_image' };
  }

  return {
    ok: true,
    bytes,
    mimeType,
    width,
    height,
    sizeBytes: bytes.byteLength,
  };
}
