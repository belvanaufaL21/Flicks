import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { createSupabaseReportService } from '@/server/reports/report.service';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Report service is not configured',
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

  const tokenVerification =
    await createSupabaseTokenService().verifyToken(providedToken);
  if (!tokenVerification.ok && tokenVerification.code === 'TOKEN_REQUIRED') {
    return errorResponse(
      401,
      'TOKEN_REQUIRED',
      'Missing or invalid Authorization header',
    );
  }
  if (!tokenVerification.ok && tokenVerification.code === 'TOKEN_EXPIRED') {
    return errorResponse(401, 'TOKEN_EXPIRED', 'Token is no longer valid');
  }
  if (!tokenVerification.token?.id) {
    return errorResponse(401, 'TOKEN_REQUIRED', 'Invalid token');
  }

  try {
    const reportService = createSupabaseReportService();
    const created = await reportService.createOrGetReport(
      tokenVerification.token.id,
    );

    return NextResponse.json(
      {
        report_id: created.reportId,
        secret: created.secret,
        expires_at: created.expiresAt,
        url: `/result/${created.secret}`,
      },
      { status: 201 },
    );
  } catch {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to issue private report link',
    );
  }
}
