import { NextResponse } from 'next/server';
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
import {
  checkVtoQuota,
  consumeVtoQuota,
  createFashnRestProvider,
  createSupabaseVirtualTryOnService,
  executeVtoPipeline,
} from '@/server/vto/virtual-try-on.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, 'virtual_try_on');
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
      'Virtual try-on service is not configured',
    );
  }

  let body: {
    analysis_id?: unknown;
    product_id?: unknown;
    top_product_id?: unknown;
    bottom_product_id?: unknown;
    photo_path?: unknown;
    user_photo_uri?: unknown;
    token_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(400, 'INVALID_PHOTO', 'Request body must be JSON');
  }

  // Dual-quota sequential chaining path (top_product_id and/or bottom_product_id)
  if (body.top_product_id !== undefined || body.bottom_product_id !== undefined) {
    const providedToken = extractBearerToken(
      request.headers.get('authorization'),
    );
    let resolvedTokenId =
      typeof body.token_id === 'string' && body.token_id.trim()
        ? body.token_id.trim()
        : null;

    if (providedToken) {
      const tokenService = createSupabaseTokenService();
      const reservation = await tokenService.reserveToken(providedToken, {
        allowReserved: true,
      });
      if (reservation.ok) {
        resolvedTokenId = reservation.token.id;
      }
    }

    if (!resolvedTokenId) {
      return errorResponse(
        401,
        'TOKEN_REQUIRED',
        'Missing or invalid token for virtual try-on',
      );
    }

    const topProductId =
      typeof body.top_product_id === 'string' && body.top_product_id.trim()
        ? body.top_product_id.trim()
        : null;
    const bottomProductId =
      typeof body.bottom_product_id === 'string' && body.bottom_product_id.trim()
        ? body.bottom_product_id.trim()
        : null;

    if (!topProductId && !bottomProductId) {
      return errorResponse(
        400,
        'INVALID_PRODUCT',
        'Pilih minimal satu produk atasan atau bawahan',
      );
    }

    const currentQuota = checkVtoQuota(resolvedTokenId);
    if (topProductId && !currentQuota.canTryTop) {
      return errorResponse(
        403,
        'TOP_QUOTA_EXHAUSTED',
        'Kuota atasan sudah terpakai untuk sesi ini',
      );
    }
    if (bottomProductId && !currentQuota.canTryBottom) {
      return errorResponse(
        403,
        'BOTTOM_QUOTA_EXHAUSTED',
        'Kuota bawahan sudah terpakai untuk sesi ini',
      );
    }

    const userPhotoUri =
      typeof body.user_photo_uri === 'string' && body.user_photo_uri.trim()
        ? body.user_photo_uri.trim()
        : typeof body.photo_path === 'string' && body.photo_path.trim()
          ? body.photo_path.trim()
          : null;

    if (!userPhotoUri) {
      return errorResponse(400, 'INVALID_PHOTO', 'Invalid user photo path');
    }

    const vtoService = createSupabaseVirtualTryOnService();
    const activeCatalog = await vtoService.listActiveProducts();
    const topProduct = topProductId
      ? activeCatalog.find((p) => p.id === topProductId) ?? null
      : null;
    const bottomProduct = bottomProductId
      ? activeCatalog.find((p) => p.id === bottomProductId) ?? null
      : null;

    if (topProductId && !topProduct) {
      return errorResponse(400, 'INVALID_PRODUCT', 'Produk atasan tidak aktif atau tidak ditemukan');
    }
    if (bottomProductId && !bottomProduct) {
      return errorResponse(400, 'INVALID_PRODUCT', 'Produk bawahan tidak aktif atau tidak ditemukan');
    }

    const pipelineResult = await executeVtoPipeline(
      {
        userPhotoUri,
        topProduct,
        bottomProduct,
      },
      createFashnRestProvider(),
    );

    const quotaUpdate = consumeVtoQuota(resolvedTokenId, {
      consumeTop: pipelineResult.quotaDeduction.top,
      consumeBottom: pipelineResult.quotaDeduction.bottom,
    });

    return NextResponse.json(
      {
        status: pipelineResult.status,
        result_image_uri: pipelineResult.finalImageUri,
        step1_image_uri: pipelineResult.step1ImageUri ?? null,
        quota: quotaUpdate.quota,
        warning_message: pipelineResult.warningMessage ?? null,
        error_message: pipelineResult.errorMessage ?? null,
      },
      { status: pipelineResult.status === 'failed' ? 502 : 200 },
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

    // Input validation at API boundary
    const PHOTO_PATH_PATTERN = /^(face|full-body)\/[a-zA-Z0-9_-]{1,128}$/;
    const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

    if (typeof body.photo_path !== 'string' || !PHOTO_PATH_PATTERN.test(body.photo_path)) {
      return errorResponse(400, 'INVALID_PHOTO', 'Invalid photo_path format');
    }
    if (typeof body.analysis_id !== 'string' || !ID_PATTERN.test(body.analysis_id)) {
      return errorResponse(404, 'JOB_NOT_FOUND', 'Invalid analysis job ID');
    }
    if (typeof body.product_id !== 'string' || !ID_PATTERN.test(body.product_id)) {
      return errorResponse(
        400,
        'INVALID_PRODUCT',
        'Invalid product ID',
      );
    }

  if (!process.env.FASHN_API_KEY?.trim()) {
    return errorResponse(
      503,
      'SERVICE_UNAVAILABLE',
      'Virtual try-on provider is not configured',
    );
  }

  const tokenService = createSupabaseTokenService();
  const reservation = await tokenService.reserveToken(providedToken, {
    allowReserved: true,
  });

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

  const vtoService = createSupabaseVirtualTryOnService();
  const created = await vtoService.createOrRetryJob({
    tokenId: reservation.token.id,
    analysisId: body.analysis_id,
    productId: body.product_id,
    photoPath: body.photo_path,
  });

  if (!created.ok) {
    if (created.code === 'TOKEN_CONSUMED') {
      return errorResponse(
        403,
        'TOKEN_CONSUMED',
        'Token has already been used for virtual try-on',
      );
    }
    if (created.code === 'JOB_IN_PROGRESS') {
      return errorResponse(
        409,
        'JOB_IN_PROGRESS',
        'Virtual try-on is currently processing',
      );
    }
    if (created.code === 'RETRY_LIMIT_REACHED') {
      return errorResponse(
        403,
        'RETRY_LIMIT_REACHED',
        'Maximum retry limit reached for this session',
      );
    }
    if (created.code === 'JOB_NOT_FOUND') {
      return errorResponse(404, 'JOB_NOT_FOUND', 'Analysis job does not exist');
    }
    if (created.code === 'INVALID_PRODUCT') {
      return errorResponse(
        400,
        'INVALID_PRODUCT',
        'Product is not active or does not exist',
      );
    }
    return errorResponse(400, 'INVALID_PHOTO', 'Invalid photo_path');
  }

  // ponytail: inline processJob execution without background worker; upgrade when concurrency > 10 req/s
  const processed = await vtoService.processJob(created.job.id);

  return NextResponse.json(
    {
      job_id: processed.id,
      status: processed.status,
      attempt_count: processed.attemptCount,
      max_attempts: 3,
      token_recovery_status: processed.tokenRecoveryStatus,
    },
    { status: 201 },
  );
}
