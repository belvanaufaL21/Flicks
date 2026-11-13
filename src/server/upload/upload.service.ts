import 'server-only';
import {
  validatePhoto,
  type PhotoValidationResult,
} from '@/server/photo/validate-photo';
import {
  createSupabasePhotoStorage,
  type PhotoAsset,
} from '@/server/storage/private-photo-storage';
import type { PhotoKind } from '@/shared/photo-policy';

export interface UploadPhotoInput {
  bytes: Uint8Array;
  declaredMimeType: string;
  kind: PhotoKind;
  consent: boolean;
}

export interface UploadServiceDeps {
  validate?: (input: {
    bytes: Uint8Array;
    declaredMimeType: string;
  }) => Promise<PhotoValidationResult>;
  storage?: {
    store(
      photo: Extract<PhotoValidationResult, { ok: true }>,
      kind: PhotoKind,
    ): Promise<PhotoAsset>;
  };
}

export type UploadPhotoResult =
  | {
      ok: true;
      photo_path: string;
      expires_at: string;
    }
  | {
      ok: false;
      code: 'INVALID_CONSENT';
    }
  | {
      ok: false;
      code: 'INVALID_PHOTO';
      reason: Exclude<PhotoValidationResult, { ok: true }>['code'];
    };

export async function validateAndStorePhoto(
  input: UploadPhotoInput,
  deps: UploadServiceDeps = {},
): Promise<UploadPhotoResult> {
  if (input.consent !== true) {
    return {
      ok: false,
      code: 'INVALID_CONSENT',
    };
  }

  const validate = deps.validate ?? validatePhoto;
  const validation = await validate({
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
  });

  if (!validation.ok) {
    return {
      ok: false,
      code: 'INVALID_PHOTO',
      reason: validation.code,
    };
  }

  const storage = deps.storage ?? createSupabasePhotoStorage();
  const stored = await storage.store(validation, input.kind);

  return {
    ok: true,
    photo_path: stored.objectPath,
    expires_at: stored.expiresAt,
  };
}
