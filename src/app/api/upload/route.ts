import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { PhotoStorageError } from '@/server/storage/private-photo-storage';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';
import { validateAndStorePhoto } from '@/server/upload/upload.service';
import { PHOTO_POLICY, type PhotoKind } from '@/shared/photo-policy';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Photo storage or token service is not configured',
    );
  }

  const providedToken = extractBearerToken(
    request.headers.get('authorization'),
  );
  if (!providedToken) {
    return errorResponse(
      401,
      'TOKEN_REQUIRED',
      'Missing or invalid Authorization header',
    );
  }

  let tokenVerification: Awaited<
    ReturnType<ReturnType<typeof createSupabaseTokenService>['verifyToken']>
  >;
  try {
    tokenVerification =
      await createSupabaseTokenService().verifyToken(providedToken);
  } catch {
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to verify token');
  }

  if (!tokenVerification.ok) {
    if (tokenVerification.code === 'TOKEN_CONSUMED') {
      return errorResponse(
        403,
        'TOKEN_CONSUMED',
        'Token has already been used',
      );
    }

    if (tokenVerification.code === 'TOKEN_EXPIRED') {
      return errorResponse(401, 'TOKEN_EXPIRED', 'Token is no longer valid');
    }

    return errorResponse(
      401,
      'TOKEN_REQUIRED',
      'Missing or invalid Authorization header',
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      400,
      'INVALID_PHOTO',
      'Request must be valid multipart/form-data',
    );
  }

  if (formData.get('consent') !== 'true') {
    return errorResponse(
      400,
      'INVALID_CONSENT',
      'Consent is required before uploading a photo',
    );
  }

  const rawKind = formData.get('kind');
  const kindValue: PhotoKind | null =
    rawKind === null
      ? 'face'
      : rawKind === 'face' || rawKind === 'fullBody'
        ? rawKind
        : null;

  if (!kindValue) {
    return errorResponse(400, 'INVALID_PHOTO', 'Invalid photo kind');
  }

  const photos = formData.getAll('photo');
  if (photos.length === 0 || !(photos[0] instanceof File)) {
    return errorResponse(400, 'INVALID_PHOTO', 'Photo file is required');
  }

  if (
    photos.length > PHOTO_POLICY.maxCount[kindValue] ||
    photos.some((entry) => !(entry instanceof File))
  ) {
    return errorResponse(
      400,
      'INVALID_PHOTO',
      'Exceeded maximum allowed photo count for slot',
    );
  }

  const file = photos[0];

  try {
    const result = await validateAndStorePhoto({
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredMimeType: file.type,
      kind: kindValue,
      consent: true,
    });

    if (!result.ok) {
      if (result.code === 'INVALID_CONSENT') {
        return errorResponse(
          400,
          'INVALID_CONSENT',
          'Consent is required before uploading a photo',
        );
      }

      return errorResponse(
        422,
        'INVALID_PHOTO',
        `Photo failed validation (${result.reason})`,
      );
    }

    return NextResponse.json(
      {
        photo_path: result.photo_path,
        expires_at: result.expires_at,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PhotoStorageError) {
      const status = error.code === 'upload_failed' ? 502 : 500;
      return errorResponse(status, 'INTERNAL_ERROR', 'Failed to store photo');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error');
  }
}
