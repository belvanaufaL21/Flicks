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
import { readSessionHash } from '@/lib/session';
import { analysisForSession } from '@/services/analysis.service';

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
        'Analysis service is not configured',
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

  try {
    const sessionHash = await readSessionHash();
    if (!sessionHash) {
      return errorResponse(
        401,
        'TOKEN_REQUIRED',
        'Missing or invalid Authorization header',
      );
    }
    const a = await analysisForSession(jobId, sessionHash);
    return NextResponse.json({
      id: a.id,
      job_id: a.id,
      status: a.status,
      error: a.error,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Analisis tidak ditemukan.';
    return errorResponse(404, 'JOB_NOT_FOUND', message);
  }
}
