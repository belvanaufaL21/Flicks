import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';
import { createSupabaseVirtualTryOnService, sanitizeErrorForClient } from '@/server/vto/virtual-try-on.service';

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
      'Virtual try-on service is not configured',
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

  const vtoService = createSupabaseVirtualTryOnService();
  let job;
  try {
    job = await vtoService.syncJobStatus(
      jobId,
      tokenVerification.token?.id ?? '',
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'JOB_NOT_FOUND') {
      return errorResponse(404, 'JOB_NOT_FOUND', 'Job ID does not exist');
    }
    throw err;
  }

  if (!job) {
    return errorResponse(404, 'JOB_NOT_FOUND', 'Job ID does not exist');
  }

    if (job.tokenId !== tokenVerification.token?.id) {
      return errorResponse(403, 'FORBIDDEN', 'Token does not own this job');
    }

    return NextResponse.json(
    {
      job_id: job.id,
      status: job.status,
      ...(job.resultPath ? { result_path: job.resultPath } : {}),
      attempt_count: job.attemptCount,
      max_attempts: 3,
      token_recovery_status: job.tokenRecoveryStatus,
          ...(job.error ? { error_message: sanitizeErrorForClient(job.error) } : {}),
    },
    { status: 200 },
  );
}
