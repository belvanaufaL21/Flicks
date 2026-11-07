import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabasePhotoStorage, validatePhoto, PhotoStorageError } =
  vi.hoisted(() => {
    class MockPhotoStorageError extends Error {
      constructor(readonly code: string) {
        super(code);
      }
    }
    return {
      createSupabasePhotoStorage: vi.fn(),
      validatePhoto: vi.fn(),
      PhotoStorageError: MockPhotoStorageError,
    };
  });

vi.mock('../../src/server/storage/private-photo-storage', () => ({
  createSupabasePhotoStorage,
  PhotoStorageError,
}));

vi.mock('../../src/server/photo/validate-photo', () => ({
  validatePhoto,
}));

import { POST } from '../../src/app/api/dev/photo-upload/route';

function createRequest(options: {
  consent?: string;
  kind?: string;
  authorization?: string;
} = {}) {
  const formData = new FormData();
  formData.set('photo', new File([Buffer.from('image')], 'face.png', {
    type: 'image/png',
  }));
  formData.set('kind', options.kind ?? 'face');
  formData.set('consent', options.consent ?? 'true');

  return new Request('http://localhost/api/dev/photo-upload', {
    method: 'POST',
    headers: options.authorization
      ? { authorization: options.authorization }
      : undefined,
    body: formData,
  });
}

describe('POST /api/dev/photo-upload', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_PROVIDER_TEST_TOKEN', 'local-test-token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    validatePhoto.mockResolvedValue({ ok: false, code: 'unsupported_type' });
    createSupabasePhotoStorage.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is unavailable in production even with a valid development token', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await POST(
      createRequest({ authorization: 'Bearer local-test-token' }),
    );

    expect(response.status).toBe(404);
    expect(validatePhoto).not.toHaveBeenCalled();
    expect(createSupabasePhotoStorage).not.toHaveBeenCalled();
  });

  it('requires affirmative consent before validating or storing a photo', async () => {
    const response = await POST(
      createRequest({
        consent: 'false',
        authorization: 'Bearer local-test-token',
      }),
    );

    expect(response.status).toBe(400);
    expect(validatePhoto).not.toHaveBeenCalled();
    expect(createSupabasePhotoStorage).not.toHaveBeenCalled();
  });

  it('rejects an invalid photo before initializing private storage', async () => {
    for (const code of [
      'unsupported_type',
      'mime_mismatch',
      'file_too_large',
      'dimensions_out_of_range',
      'unreadable_image',
    ] as const) {
      validatePhoto.mockResolvedValueOnce({ ok: false, code });
      const response = await POST(
        createRequest({ authorization: `Bearer ${process.env.DEV_PROVIDER_TEST_TOKEN}` }),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: { code } });
    }
    expect(createSupabasePhotoStorage).not.toHaveBeenCalled();
  });

  it('denies unauthorized direct upload requests without a valid bearer token (QA-12)', async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(validatePhoto).not.toHaveBeenCalled();
    expect(createSupabasePhotoStorage).not.toHaveBeenCalled();
  });

  it('rejects requests that exceed the approved single-photo count per kind', async () => {
    const formData = new FormData();
    formData.append(
      'photo',
      new File([Buffer.from('image-1')], 'face-1.png', { type: 'image/png' }),
    );
    formData.append(
      'photo',
      new File([Buffer.from('image-2')], 'face-2.png', { type: 'image/png' }),
    );
    formData.set('kind', 'face');
    formData.set('consent', 'true');

    const response = await POST(
      new Request('http://localhost/api/dev/photo-upload', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.DEV_PROVIDER_TEST_TOKEN}`,
        },
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'invalid_photo_count' },
    });
    expect(validatePhoto).not.toHaveBeenCalled();
    expect(createSupabasePhotoStorage).not.toHaveBeenCalled();
  });

  it('stores a valid photo privately and omits objectPath and public URLs from the response (QA-12)', async () => {
    const store = vi.fn().mockResolvedValue({
      id: 'opaque-photo-id',
      kind: 'face',
      objectPath: 'face/opaque-photo-id',
      mimeType: 'image/png',
      sizeBytes: 1200,
      width: 512,
      height: 768,
      createdAt: '2026-10-23T12:00:00.000Z',
      expiresAt: '2026-10-26T12:00:00.000Z',
    });
    createSupabasePhotoStorage.mockReturnValue({ store });
    validatePhoto.mockResolvedValueOnce({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      width: 512,
      height: 768,
      sizeBytes: 1200,
    });

    const response = await POST(
      createRequest({
        authorization: `Bearer ${process.env.DEV_PROVIDER_TEST_TOKEN}`,
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      photo: {
        id: 'opaque-photo-id',
        kind: 'face',
        mimeType: 'image/png',
        sizeBytes: 1200,
        width: 512,
        height: 768,
        createdAt: '2026-10-23T12:00:00.000Z',
        expiresAt: '2026-10-26T12:00:00.000Z',
      },
    });
    expect(body.photo.objectPath).toBeUndefined();
    expect(body.photo.publicUrl).toBeUndefined();
    expect(body.photo.url).toBeUndefined();
  });
});
