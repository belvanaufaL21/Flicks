import { NextResponse } from 'next/server';
import { hasMatchingSecret } from '@/server/dev/access';
import {
  createSupabasePhotoCleanupService,
  PhotoCleanupError,
} from '@/server/storage/cleanup-expired-photos';

function errorResponse(status: number, code: string) {
  return NextResponse.json({ error: { code } }, { status });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret?.trim()) {
    return errorResponse(503, 'scheduled_cleanup_not_configured');
  }

  const authorization = request.headers.get('authorization');
  const providedSecret = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  if (!hasMatchingSecret(cronSecret, providedSecret)) {
    return errorResponse(401, 'unauthorized');
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return errorResponse(503, 'photo_storage_not_configured');
  }

  try {
    const result = await createSupabasePhotoCleanupService().run();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PhotoCleanupError) {
      return errorResponse(500, error.code);
    }

    throw error;
  }
}
