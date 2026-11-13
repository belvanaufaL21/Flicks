import 'server-only';
import type { StoredPhotoKind } from '@/shared/photo-policy';
import {
  canUseLocalDevFallback,
  createInMemoryPhotoRepository,
} from '@/server/dev/local-memory-store';
import type { ValidatedPhoto } from '@/server/photo/validate-photo';
import { createSupabasePhotoRepository } from '@/server/storage/supabase-photo-repository';

export const PRIVATE_PHOTO_BUCKET = 'flicks-private-photos';
export const PHOTO_RETENTION_MS = 72 * 60 * 60 * 1000;

export interface PhotoAsset {
  id: string;
  kind: StoredPhotoKind;
  objectPath: string;
  mimeType: ValidatedPhoto['mimeType'];
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
  expiresAt: string;
}

export interface PhotoStorageRepository {
  upload(
    objectPath: string,
    bytes: Uint8Array,
    mimeType: PhotoAsset['mimeType'],
  ): Promise<void>;
  createRecord(asset: PhotoAsset): Promise<void>;
  deleteObject(objectPath: string): Promise<void>;
  deleteRecord?(id: string): Promise<void>;
  listExpired?(expiresBefore: string): Promise<PhotoAsset[]>;
  downloadObject?(objectPath: string): Promise<{
    bytes: Uint8Array;
    mimeType: PhotoAsset['mimeType'];
  } | null>;
}

export class PhotoStorageError extends Error {
  constructor(
    readonly code:
      | 'upload_failed'
      | 'metadata_failed'
      | 'metadata_failed_cleanup_failed'
      | 'delete_failed',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'PhotoStorageError';
  }
}

interface PhotoStorageOptions {
  createId?: () => string;
  now?: () => Date;
}

export function createPhotoStorageService(
  repository: PhotoStorageRepository,
  options: PhotoStorageOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return {
    async store(
      photo: ValidatedPhoto,
      kind: StoredPhotoKind,
    ): Promise<PhotoAsset> {
      const createdAt = now();
      const id = createId();
      const prefix = kind === 'fullBody' ? 'full-body' : kind === 'vtoResult' ? 'vto' : 'face';
      const objectPath = `${prefix}/${id}`;
      const asset: PhotoAsset = {
        id,
        kind,
        objectPath,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        width: photo.width,
        height: photo.height,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(
          createdAt.getTime() + PHOTO_RETENTION_MS,
        ).toISOString(),
      };

      try {
        await repository.upload(objectPath, photo.bytes, photo.mimeType);
      } catch (cause) {
        throw new PhotoStorageError('upload_failed', { cause });
      }

      try {
        await repository.createRecord(asset);
      } catch (cause) {
        try {
          await repository.deleteObject(objectPath);
        } catch (cleanupCause) {
          throw new PhotoStorageError('metadata_failed_cleanup_failed', {
            cause: new AggregateError([cause, cleanupCause]),
          });
        }
        throw new PhotoStorageError('metadata_failed', { cause });
      }

      return asset;
    },

    async delete(asset: Pick<PhotoAsset, 'id' | 'objectPath'>): Promise<void> {
      try {
        await repository.deleteObject(asset.objectPath);
        if (repository.deleteRecord) {
          await repository.deleteRecord(asset.id);
        }
      } catch (cause) {
        throw new PhotoStorageError('delete_failed', { cause });
      }
    },

    async read(objectPath: string): Promise<{
      bytes: Uint8Array;
      mimeType: PhotoAsset['mimeType'];
    } | null> {
      if (!repository.downloadObject) {
        return null;
      }
      return await repository.downloadObject(objectPath);
    },
  };
}

export function createSupabasePhotoStorage() {
  if (canUseLocalDevFallback()) {
    return createPhotoStorageService(createInMemoryPhotoRepository());
  }
  return createPhotoStorageService(createSupabasePhotoRepository());
}
