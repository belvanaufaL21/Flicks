import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';
import {
  createSupabaseVirtualTryOnService,
  sanitizeErrorForClient,
} from '@/server/vto/virtual-try-on.service';
import { readSessionHash } from '@/lib/session';
import { getStore } from '@/lib/store';
import { analysisForSession } from '@/services/analysis.service';
import { refreshTryon } from '@/services/tryon.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId?: string; id?: string }> | { jobId?: string; id?: string } },
) {
  const params = await context.params;
  const jobId = params.jobId ?? params.id ?? '';

  const providedToken = extractBearerToken(
    request.headers.get('authorization'),
  );

  if (providedToken) {
    if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
      return errorResponse(
        503,
        'INTERNAL_ERROR',
        'Virtual try-on service is not configured',
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

  try {
    const sessionHash = await readSessionHash();
    const job = await getStore().tryonJob(jobId);
    if (!sessionHash || !job) {
      return errorResponse(
        401,
        'TOKEN_REQUIRED',
        'Missing or invalid Authorization header',
      );
    }
    await analysisForSession(job.analysisId, sessionHash);
    const next = await refreshTryon(job);
    return NextResponse.json({
      id: next.id,
      job_id: next.id,
      status: next.status,
      error: next.error,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Job tidak ditemukan.';
    return errorResponse(404, 'JOB_NOT_FOUND', message);
  }
}
