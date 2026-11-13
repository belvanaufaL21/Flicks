import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { createSupabaseTokenService } from '@/server/tokens/token.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse(
      404,
      'NOT_FOUND',
      'Development token endpoint is not available in production',
    );
  }

  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Token service is not configured',
    );
  }

  const rawCount = new URL(request.url).searchParams.get('count');
  const count = rawCount === null ? 1 : Number(rawCount);

  if (!Number.isInteger(count) || count < 1 || count > 20) {
    return errorResponse(
      400,
      'INVALID_COUNT',
      'count must be an integer between 1 and 20',
    );
  }

  try {
    const tokens = await createSupabaseTokenService().createDevTokens(count);
    return NextResponse.json({ tokens }, { status: 200 });
  } catch {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to generate development tokens',
    );
  }
}
