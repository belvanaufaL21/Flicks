import { NextResponse } from 'next/server';
import { hasValidDevelopmentAccess } from '@/server/dev/access';
import { validatePhoto } from '@/server/photo/validate-photo';
import {
  createSupabasePhotoStorage,
  PhotoStorageError,
} from '@/server/storage/private-photo-storage';
import { PHOTO_POLICY, type PhotoKind } from '@/shared/photo-policy';

function errorResponse(status: number, code: string) {
  return NextResponse.json({ error: { code } }, { status });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse(404, 'not_found');
  }

  const configuredToken = process.env.DEV_PROVIDER_TEST_TOKEN;
  if (!configuredToken?.trim()) {
    return errorResponse(503, 'development_access_not_configured');
  }

  const authorization = request.headers.get('authorization');
  const providedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (
    !hasValidDevelopmentAccess(
      process.env.NODE_ENV,
      configuredToken,
      providedToken,
    )
  ) {
    return errorResponse(401, 'unauthorized');
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return errorResponse(503, 'photo_storage_not_configured');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, 'invalid_multipart_request');
  }

  if (formData.get('consent') !== 'true') {
    return errorResponse(400, 'consent_required');
  }

  const kindValue = formData.get('kind');
  if (kindValue !== 'face' && kindValue !== 'fullBody') {
    return errorResponse(400, 'invalid_photo_kind');
  }

  const photos = formData.getAll('photo');
  if (photos.length === 0 || !(photos[0] instanceof File)) {
    return errorResponse(400, 'photo_required');
  }
  if (
    photos.length > PHOTO_POLICY.maxCount[kindValue] ||
    photos.some((entry) => !(entry instanceof File))
  ) {
    return errorResponse(400, 'invalid_photo_count');
  }

  const file = photos[0];
  const validation = await validatePhoto({
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredMimeType: file.type,
  });
  if (!validation.ok) {
    return errorResponse(422, validation.code);
  }

  try {
    const stored = await createSupabasePhotoStorage().store(
      validation,
      kindValue satisfies PhotoKind,
    );

    return NextResponse.json(
      {
        photo: {
          id: stored.id,
          kind: stored.kind,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PhotoStorageError) {
      const status = error.code === 'upload_failed' ? 502 : 500;
      return errorResponse(status, error.code);
    }

    throw error;
  }
}
