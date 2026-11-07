import { NextResponse } from 'next/server';
import { createSupabaseAnalysisService } from '@/server/analysis/analysis.service';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { enforcePaidWorkActive } from '@/server/security/kill-switch';
import { enforceRateLimit } from '@/server/security/rate-limiter';
import {
  createSupabaseTokenService,
  extractBearerToken,
} from '@/server/tokens/token.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, 'analysis');
  if (rateLimited) {
    return rateLimited;
  }

  const paused = await enforcePaidWorkActive();
  if (paused) {
    return paused;
  }

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

  let body: {
    photo_path?: unknown;
    full_body_photo_path?: unknown;
    gender?: unknown;
    consent?: unknown;
  };
  try {
    body = (await request.json()) as {
      photo_path?: unknown;
      full_body_photo_path?: unknown;
      gender?: unknown;
      consent?: unknown;
    };
  } catch {
    return errorResponse(400, 'INVALID_PHOTO', 'Request body must be JSON');
  }

  if (body.consent !== true) {
    return errorResponse(
      400,
      'INVALID_CONSENT',
      'Consent is required before analysis',
    );
  }

  if (body.gender !== 'male' && body.gender !== 'female') {
    return errorResponse(
      400,
      'INVALID_GENDER',
      'Gender (male or female) is required before analysis',
    );
  }

  if (typeof body.photo_path !== 'string' || !body.photo_path.trim()) {
    return errorResponse(
      400,
      'INVALID_PHOTO',
      'Valid photo_path is required before analysis',
    );
  }

  const tokenService = createSupabaseTokenService();
  let reservation: Awaited<ReturnType<typeof tokenService.reserveToken>>;
  try {
    reservation = await tokenService.reserveToken(providedToken);
  } catch {
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to reserve token');
  }

  if (!reservation.ok) {
    if (reservation.code === 'TOKEN_CONSUMED') {
      return errorResponse(
        403,
        'TOKEN_CONSUMED',
        'Token has already been used',
      );
    }
    if (reservation.code === 'TOKEN_EXPIRED') {
      return errorResponse(401, 'TOKEN_EXPIRED', 'Token is no longer valid');
    }
    return errorResponse(
      401,
      'TOKEN_REQUIRED',
      'Missing or invalid Authorization header',
    );
  }

  try {
    const analysisService = createSupabaseAnalysisService();
    const created = await analysisService.createJob({
      tokenId: reservation.token.id,
      photoPath: body.photo_path,
      ...(typeof body.full_body_photo_path === 'string' &&
      body.full_body_photo_path.trim()
        ? { fullBodyPhotoPath: body.full_body_photo_path.trim() }
        : {}),
      gender: body.gender,
      consent: true,
    });

    if (!created.ok) {
      if (created.code === 'TOKEN_CONSUMED') {
        return errorResponse(
          403,
          'TOKEN_CONSUMED',
          'Token has already been used for an analysis job',
        );
      }
      await tokenService.releaseToken?.(reservation.token.id);
      return errorResponse(400, created.code, 'Invalid analysis request');
    }

    if (process.env.GEMINI_API_KEY?.trim()) {
      const processed = await analysisService.processJob(created.job.id);
      if (processed?.status === 'failed') {
        // Policy: release reserved token on provider failure so user can retry without paying again
        await tokenService.releaseToken?.(reservation.token.id);
      }
    }

    return NextResponse.json(
      {
        job_id: created.job.id,
        status: created.job.status,
      },
      { status: 201 },
    );
  } catch {
    await tokenService.releaseToken?.(reservation.token.id);
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to create analysis job');
  }
}
