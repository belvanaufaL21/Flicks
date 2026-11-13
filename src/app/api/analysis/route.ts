import { after, NextResponse } from 'next/server';
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
import { errorResponse as flowErrorResponse, json, tooManyRequests } from '@/lib/http/respond';
import { readReportSecret, readSessionHash, rememberReportSecret } from '@/lib/session';
import { getFlowState } from '@/services/session-state.service';
import { PHOTO_LIMITS, PhotoError, validatePhoto } from '@/lib/validation/image';
import { FlowError, runAnalysis, startAnalysis } from '@/services/analysis.service';

export const maxDuration = 120;

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

async function readPhoto(form: FormData, field: string, label: string) {
  const file = form.get(field);
  if (!(file instanceof File)) throw new PhotoError(`${label} wajib diunggah.`);
  if (file.size > PHOTO_LIMITS.maxBytes) throw new PhotoError(`${label}: ukuran file terlalu besar.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, info: validatePhoto(bytes, label) };
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

  const contentType = request.headers.get('content-type') ?? '';

  // Branch 1: Multipart form submission (Belva's browser intake flow)
  if (contentType.includes('multipart/form-data')) {
    try {
      const sessionHash = await readSessionHash();
      if (!sessionHash) {
        throw new FlowError('Sesi tidak ditemukan. Mulai dari pembayaran.', 401);
      }

      const length = Number(request.headers.get('content-length') ?? 0);
      if (length > PHOTO_LIMITS.maxBytes * 2 + 64 * 1024) {
        throw new PhotoError('Total ukuran foto terlalu besar.');
      }

      const form = await request.formData();
      if (form.get('consent') !== 'true') {
        throw new FlowError('Persetujuan pemrosesan foto wajib dicentang.', 422);
      }
      const idempotencyKey = String(form.get('idempotencyKey') ?? '');
      if (!/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) {
        throw new FlowError('Permintaan tidak valid.', 400);
      }

      const face = await readPhoto(form, 'face', 'Foto wajah');
      const body = await readPhoto(form, 'body', 'Foto seluruh badan');

      const { analysis, reportSecret } = await startAnalysis({
        sessionHash,
        idempotencyKey,
        face,
        body,
      });

      if (reportSecret) {
        await rememberReportSecret(reportSecret);
        try {
          after(() => runAnalysis(analysis.id));
        } catch {
          runAnalysis(analysis.id).catch(console.error);
        }
      }

      const state = await getFlowState(
        sessionHash,
        reportSecret ?? (await readReportSecret()),
      );
      return json(
        { id: analysis.id, status: analysis.status, state },
        reportSecret ? 201 : 200,
      );
    } catch (err) {
      return flowErrorResponse(err);
    }
  }

  // Branch 2: JSON payload with Bearer token (Core backend & automated tests)
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
  }
}
