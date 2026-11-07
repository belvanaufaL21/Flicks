import { describe, expect, it, vi } from 'vitest';
import {
  createPhotoStorageService,
  type PhotoStorageRepository,
} from '../../src/server/storage/private-photo-storage';
import { validateAndStorePhoto } from '../../src/server/upload/upload.service';

describe('validateAndStorePhoto (Tasks 2.3, 2.4, 2.5)', () => {
  it('enforces affirmative consent before running photo validation or private storage (2.5)', async () => {
    const validate = vi.fn();
    const store = vi.fn();

    const result = await validateAndStorePhoto(
      {
        bytes: new Uint8Array([1, 2, 3]),
        declaredMimeType: 'image/png',
        kind: 'face',
        consent: false,
      },
      { validate, storage: { store } },
    );

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_CONSENT',
    });
    expect(validate).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('enforces server-side photo validation and rejects invalid photos before storage (2.3)', async () => {
    const store = vi.fn();
    for (const reason of [
      'unsupported_type',
      'file_too_large',
      'mime_mismatch',
      'dimensions_out_of_range',
      'unreadable_image',
    ] as const) {
      const validate = vi.fn().mockResolvedValueOnce({
        ok: false,
        code: reason,
      });

      const result = await validateAndStorePhoto(
        {
          bytes: new Uint8Array([1, 2, 3]),
          declaredMimeType: 'image/png',
          kind: 'face',
          consent: true,
        },
        { validate, storage: { store } },
      );

      expect(result).toEqual({
        ok: false,
        code: 'INVALID_PHOTO',
        reason,
      });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('stores validated photos in private storage with non-guessable paths and 72-hour expiry (2.4)', async () => {
    const repository: PhotoStorageRepository = {
      upload: vi.fn().mockResolvedValue(undefined),
      createRecord: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createPhotoStorageService(repository, {
      createId: () => '9f8c2b1e-4d3a-4e7b-8a1c-5d6e7f8091a2',
      now: () => new Date('2026-10-25T12:00:00.000Z'),
    });
    const validate = vi.fn().mockResolvedValueOnce({
      ok: true,
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'image/jpeg',
      width: 640,
      height: 960,
      sizeBytes: 4,
    });

    const result = await validateAndStorePhoto(
      {
        bytes: new Uint8Array([1, 2, 3, 4]),
        declaredMimeType: 'image/jpeg',
        kind: 'fullBody',
        consent: true,
      },
      { validate, storage },
    );

    expect(result).toEqual({
      ok: true,
      photo_path: 'full-body/9f8c2b1e-4d3a-4e7b-8a1c-5d6e7f8091a2',
      expires_at: '2026-10-28T12:00:00.000Z',
    });
    expect(repository.upload).toHaveBeenCalledWith(
      'full-body/9f8c2b1e-4d3a-4e7b-8a1c-5d6e7f8091a2',
      new Uint8Array([1, 2, 3, 4]),
      'image/jpeg',
    );
  });
});
