import { NextResponse } from 'next/server';
import { createSupabaseAnalysisService } from '@/server/analysis/analysis.service';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Analysis service is not configured',
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

  const tokenId = tokenVerification.token?.id;
  const job = await createSupabaseAnalysisService().getJob(
    jobId,
    tokenId,
  );

  if (!job) {
    return errorResponse(404, 'JOB_NOT_FOUND', 'Job ID does not exist');
  }

  return NextResponse.json(
    {
      job_id: job.id,
      status: job.status,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error_detail: job.error } : {}),
    },
    { status: 200 },
  );
}
