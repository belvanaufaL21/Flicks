export const PHOTO_POLICY = {
  maxBytes: 10_000_000,
  minSidePx: 512,
  maxSidePx: 4096,
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  maxCount: {
    face: 1,
    fullBody: 1,
  },
} as const;

export type PhotoKind = keyof typeof PHOTO_POLICY.maxCount;
export type StoredPhotoKind = PhotoKind | 'vtoResult';
export type SupportedPhotoMimeType = (typeof PHOTO_POLICY.formats)[number];

export function isSupportedPhotoMimeType(
  mimeType: string,
): mimeType is SupportedPhotoMimeType {
  return (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp'
  );
}
