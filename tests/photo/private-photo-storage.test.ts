import { describe, expect, it, vi } from 'vitest';
import {
  createPhotoStorageService,
  PhotoStorageError,
  type PhotoAsset,
  type PhotoStorageRepository,
} from '../../src/server/storage/private-photo-storage';
import type { ValidatedPhoto } from '../../src/server/photo/validate-photo';

const photo = {
  ok: true as const,
  bytes: Buffer.from('validated-photo'),
  mimeType: 'image/png' as const,
  width: 512,
  height: 768,
  sizeBytes: 15,
};

function createRepository(): PhotoStorageRepository {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
  };
}

describe('createPhotoStorageService', () => {
  it('stores the photo privately with a 72-hour expiry and opaque path', async () => {
    const repository = createRepository();
    const service = createPhotoStorageService(repository, {
      createId: () => 'opaque-id',
      now: () => new Date('2026-10-23T12:00:00.000Z'),
    });

    const result = await service.store(photo, 'face');

    expect(result).toEqual({
      id: 'opaque-id',
      kind: 'face',
      objectPath: 'face/opaque-id',
      mimeType: 'image/png',
      sizeBytes: 15,
      width: 512,
      height: 768,
      createdAt: '2026-10-23T12:00:00.000Z',
      expiresAt: '2026-10-26T12:00:00.000Z',
    });
    expect(repository.upload).toHaveBeenCalledWith(
      'face/opaque-id',
      photo.bytes,
      'image/png',
    );
    expect(repository.createRecord).toHaveBeenCalledWith(result);
  });

  it('removes the uploaded object when metadata persistence fails', async () => {
    const repository = createRepository();
    vi.mocked(repository.createRecord).mockRejectedValue(new Error('database'));
    const service = createPhotoStorageService(repository, {
      createId: () => 'opaque-id',
      now: () => new Date('2026-10-23T12:00:00.000Z'),
    });

    await expect(service.store(photo, 'face')).rejects.toMatchObject({
      code: 'metadata_failed',
    } satisfies Partial<PhotoStorageError>);
    expect(repository.deleteObject).toHaveBeenCalledWith('face/opaque-id');
  });

  it('deletes an accepted photo object and metadata immediately when no longer needed', async () => {
    const events: string[] = [];
    const repository = createRepository();
    vi.mocked(repository.deleteObject).mockImplementation(async () => {
      events.push('object');
    });
    vi.mocked(repository.deleteRecord!).mockImplementation(async () => {
      events.push('record');
    });
    const service = createPhotoStorageService(repository);

    await service.delete({
      id: 'opaque-id',
      objectPath: 'full-body/opaque-id',
    });

    expect(repository.deleteObject).toHaveBeenCalledWith('full-body/opaque-id');
    expect(repository.deleteRecord).toHaveBeenCalledWith('opaque-id');
    expect(events).toEqual(['object', 'record']);
  });

  it('stores vtoResult photos under vto/ prefix and supports cleanup after expiry', async () => {
    const uploads: { path: string; bytes: Uint8Array; mime: string }[] = [];
    const records: PhotoAsset[] = [];
    const repo: PhotoStorageRepository = {
      upload: async (path, bytes, mime) => {
        uploads.push({ path, bytes, mime });
      },
      createRecord: async (asset) => {
        records.push(asset);
      },
      deleteObject: async () => {},
    };

    const service = createPhotoStorageService(repo, {
      createId: () => 'vto-asset-1',
      now: () => new Date('2026-11-01T12:00:00.000Z'),
    });

    const validPhoto: ValidatedPhoto = {
      ok: true,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      width: 864,
      height: 1296,
    };

    const asset = await service.store(validPhoto, 'vtoResult');
    expect(asset.kind).toBe('vtoResult');
    expect(asset.objectPath).toBe('vto/vto-asset-1');
    expect(uploads[0].path).toBe('vto/vto-asset-1');
    expect(records[0].kind).toBe('vtoResult');
  });
});
