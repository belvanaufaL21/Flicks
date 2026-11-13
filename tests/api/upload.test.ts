import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createSupabaseTokenService,
  validateAndStorePhoto,
  PhotoStorageError,
} = vi.hoisted(() => {
  class MockPhotoStorageError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    createSupabaseTokenService: vi.fn(),
    validateAndStorePhoto: vi.fn(),
    PhotoStorageError: MockPhotoStorageError,
  };
});

vi.mock('../../src/server/tokens/token.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/server/tokens/token.service')>();
  return {
    ...actual,
    createSupabaseTokenService,
  };
});

vi.mock('../../src/server/upload/upload.service', () => ({
  validateAndStorePhoto,
}));

vi.mock('../../src/server/storage/private-photo-storage', () => ({
  PhotoStorageError,
}));

import { POST } from '../../src/app/api/upload/route';

function createUploadRequest(
  options: {
    authorization?: string;
    consent?: string;
    kind?: string;
  } = {},
) {
  const formData = new FormData();
  formData.set(
    'photo',
    new File([Buffer.from('image-bytes')], 'face.png', {
      type: 'image/png',
    }),
  );
  formData.set('kind', options.kind ?? 'face');
  formData.set('consent', options.consent ?? 'true');

  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: options.authorization
      ? { authorization: options.authorization }
      : undefined,
    body: formData,
  });
}

describe('POST /api/upload', () => {
  const verifyToken = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    verifyToken.mockReset();
    validateAndStorePhoto.mockReset();
    createSupabaseTokenService.mockReturnValue({ verifyToken });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects requests without a bearer token with 401 TOKEN_REQUIRED', async () => {
    const response = await POST(createUploadRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'TOKEN_REQUIRED',
    });
    expect(verifyToken).not.toHaveBeenCalled();
    expect(validateAndStorePhoto).not.toHaveBeenCalled();
  });

  it('rejects invalid or unknown tokens with 401 TOKEN_REQUIRED and consumed tokens with 403 TOKEN_CONSUMED', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: false,
      code: 'TOKEN_REQUIRED',
    });

    const invalidResponse = await POST(
      createUploadRequest({ authorization: 'Bearer invalid-token' }),
    );
    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: 'TOKEN_REQUIRED',
    });

    verifyToken.mockResolvedValueOnce({
      ok: false,
      code: 'TOKEN_CONSUMED',
    });

    const consumedResponse = await POST(
      createUploadRequest({ authorization: 'Bearer used-token' }),
    );
    expect(consumedResponse.status).toBe(403);
    await expect(consumedResponse.json()).resolves.toMatchObject({
      error: 'TOKEN_CONSUMED',
    });
    expect(validateAndStorePhoto).not.toHaveBeenCalled();
  });

  it('requires affirmative consent before validating or storing the photo', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: true,
      token: {
        id: 'token-1',
        secretHash: 'hash',
        status: 'available',
        paymentId: null,
        reservedAt: null,
        consumedAt: null,
        createdAt: '2026-10-25T12:00:00.000Z',
      },
    });

    const response = await POST(
      createUploadRequest({
        authorization: 'Bearer valid-token',
        consent: 'false',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'INVALID_CONSENT',
    });
    expect(validateAndStorePhoto).not.toHaveBeenCalled();
  });

  it('returns 422 INVALID_PHOTO when photo validation fails', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: true,
      token: {
        id: 'token-1',
        secretHash: 'hash',
        status: 'available',
        paymentId: null,
        reservedAt: null,
        consumedAt: null,
        createdAt: '2026-10-25T12:00:00.000Z',
      },
    });
    validateAndStorePhoto.mockResolvedValueOnce({
      ok: false,
      code: 'INVALID_PHOTO',
      reason: 'dimensions_out_of_range',
    });

    const response = await POST(
      createUploadRequest({ authorization: 'Bearer valid-token' }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'INVALID_PHOTO',
    });
  });

  it('accepts a valid token and photo in production and returns photo_path and expires_at', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: true,
      token: {
        id: 'token-1',
        secretHash: 'hash',
        status: 'available',
        paymentId: null,
        reservedAt: null,
        consumedAt: null,
        createdAt: '2026-10-25T12:00:00.000Z',
      },
    });
    validateAndStorePhoto.mockResolvedValueOnce({
      ok: true,
      photo_path: 'face/opaque-photo-id',
      expires_at: '2026-10-28T12:00:00.000Z',
    });

    const response = await POST(
      createUploadRequest({ authorization: 'Bearer valid-token' }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      photo_path: 'face/opaque-photo-id',
      expires_at: '2026-10-28T12:00:00.000Z',
    });
  });
});
