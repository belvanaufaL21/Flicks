import 'server-only';
import { createSupabasePhotoRepository } from '@/server/storage/supabase-photo-repository';
import type { PhotoAsset } from '@/server/storage/private-photo-storage';

export interface PhotoCleanupRepository {
  listExpired(expiresBefore: string): Promise<PhotoAsset[]>;
  deleteObject(objectPath: string): Promise<void>;
  deleteRecord(id: string): Promise<void>;
}

export class PhotoCleanupError extends Error {
  constructor(
    readonly code: 'list_failed' | 'cleanup_failed',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'PhotoCleanupError';
  }
}

export async function cleanupExpiredPhotos(
  repository: PhotoCleanupRepository,
  now = new Date(),
): Promise<{ deletedCount: number }> {
  let expired: PhotoAsset[];
  try {
    expired = await repository.listExpired(now.toISOString());
  } catch (cause) {
    throw new PhotoCleanupError('list_failed', { cause });
  }

  let deletedCount = 0;
  const failures: unknown[] = [];

  for (const asset of expired) {
    try {
      await repository.deleteObject(asset.objectPath);
    } catch (error) {
      failures.push(error);
      continue;
    }

    try {
      await repository.deleteRecord(asset.id);
      deletedCount += 1;
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new PhotoCleanupError('cleanup_failed', {
      cause: new AggregateError(failures),
    });
  }

  return { deletedCount };
}

export function createSupabasePhotoCleanupService() {
  const repository = createSupabasePhotoRepository();

  return {
    run: () => cleanupExpiredPhotos(repository),
  };
}
