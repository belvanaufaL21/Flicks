import { describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredPhotos,
  PhotoCleanupError,
  type PhotoCleanupRepository,
} from '../../src/server/storage/cleanup-expired-photos';
import type { PhotoAsset } from '../../src/server/storage/private-photo-storage';

const expiredAsset: PhotoAsset = {
  id: 'opaque-id',
  kind: 'face',
  objectPath: 'face/opaque-id',
  mimeType: 'image/png',
  sizeBytes: 15,
  width: 512,
  height: 768,
  createdAt: '2026-10-20T12:00:00.000Z',
  expiresAt: '2026-10-23T12:00:00.000Z',
};

function createRepository(): PhotoCleanupRepository {
  return {
    listExpired: vi.fn().mockResolvedValue([expiredAsset]),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
  };
}

describe('cleanupExpiredPhotos', () => {
  it('deletes each expired object before deleting its metadata', async () => {
    const events: string[] = [];
    const repository = createRepository();
    vi.mocked(repository.deleteObject).mockImplementation(async () => {
      events.push('object');
    });
    vi.mocked(repository.deleteRecord).mockImplementation(async () => {
      events.push('record');
    });

    await expect(
      cleanupExpiredPhotos(repository, new Date('2026-10-23T12:00:00.000Z')),
    ).resolves.toEqual({ deletedCount: 1 });

    expect(repository.listExpired).toHaveBeenCalledWith(
      '2026-10-23T12:00:00.000Z',
    );
    expect(events).toEqual(['object', 'record']);
  });

  it('preserves metadata and reports failure when object deletion fails', async () => {
    const repository = createRepository();
    vi.mocked(repository.deleteObject).mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(
      cleanupExpiredPhotos(repository, new Date('2026-10-23T12:00:00.000Z')),
    ).rejects.toMatchObject({
      code: 'cleanup_failed',
    } satisfies Partial<PhotoCleanupError>);

    expect(repository.deleteRecord).not.toHaveBeenCalled();
  });

  it('does not delete an object when loading expired metadata fails', async () => {
    const repository = createRepository();
    vi.mocked(repository.listExpired).mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      cleanupExpiredPhotos(repository, new Date('2026-10-23T12:00:00.000Z')),
    ).rejects.toMatchObject({
      code: 'list_failed',
    } satisfies Partial<PhotoCleanupError>);

    expect(repository.deleteObject).not.toHaveBeenCalled();
    expect(repository.deleteRecord).not.toHaveBeenCalled();
  });
});
