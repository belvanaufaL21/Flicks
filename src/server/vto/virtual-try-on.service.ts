import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  canUseLocalDevFallback,
  getLocalDevMemoryState,
  type UsageEventRecord,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';
import {
  FASHN_CREDIT_COST_IDR,
  FASHN_ESTIMATED_COST_IDR,
  FashnProviderError,
  pollFashnTryOnStatus,
  submitFashnTryOn,
  type FashnPollOutcome,
} from '@/server/providers/fashn';
import { validatePhoto, type ValidatedPhoto } from '@/server/photo/validate-photo';
import {
  createSupabasePhotoStorage,
  type PhotoAsset,
} from '@/server/storage/private-photo-storage';
import { createSupabaseTokenService } from '@/server/tokens/token.service';
import type { StoredPhotoKind } from '@/shared/photo-policy';

export type { UsageEventRecord as VtoUsageEvent };

export interface RecordPipelineExecutionInput {
  tokenId: string;
  topProductId?: string | null;
  bottomProductId?: string | null;
  userPhotoUri: string;
  pipelineResult: VtoPipelineResult;
}

export const MAX_VTO_ATTEMPTS = 3;
export const VTO_JOB_TIMEOUT_MS = 90_000;
export const MAX_VTO_RESULT_BYTES = 10_000_000; // 10MB (matches PHOTO_POLICY.maxBytes)
export const ALLOWED_VTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type VtoJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type TokenRecoveryStatus =
  | 'not_needed'
  | 'retryable'
  | 'manual_recovery_required';

function sanitizeErrorForClient(error: string): string {
  if (error.startsWith('timeout:')) return 'Processing timed out';
  if (error.startsWith('INVALID_RESULT_PHOTO:')) return 'Invalid result image';
  if (error.startsWith('provider_error:')) return 'Provider error';
  if (error.startsWith('PROVIDER_ERROR')) return 'Provider error';
  if (error.startsWith('VTO generation timed out')) return 'Processing timed out';
  return 'Virtual try-on failed';
}

export { sanitizeErrorForClient };

export interface ProductRecord {
  id: string;
  name: string;
  brand?: string | null;
  category: string;
  imagePath: string;
  sourceUrl?: string | null;
  labels?: Record<string, unknown> | null;
  isActive: boolean;
}

export interface VtoQuotaStatus {
  topUsed: boolean;
  bottomUsed: boolean;
  topsRemaining: number;
  bottomsRemaining: number;
  canTryTop: boolean;
  canTryBottom: boolean;
}

// ponytail: in-memory quota tracking per tokenId; upgrade to Supabase tokens.vto_quota JSONB column when multi-instance scaling is added
export function checkVtoQuota(tokenId: string): VtoQuotaStatus {
  const memoryState = getLocalDevMemoryState();
  const record = memoryState.vtoQuotas?.get(tokenId);

  const topUsed = record?.topUsed ?? false;
  const bottomUsed = record?.bottomUsed ?? false;

  return {
    topUsed,
    bottomUsed,
    topsRemaining: topUsed ? 0 : 1,
    bottomsRemaining: bottomUsed ? 0 : 1,
    canTryTop: !topUsed,
    canTryBottom: !bottomUsed,
  };
}

export function consumeVtoQuota(
  tokenId: string,
  options: { consumeTop?: boolean; consumeBottom?: boolean },
): { success: boolean; error?: string; quota: VtoQuotaStatus } {
  const current = checkVtoQuota(tokenId);

  if (options.consumeTop && current.topUsed) {
    return { success: false, error: 'TOP_QUOTA_EXHAUSTED', quota: current };
  }
  if (options.consumeBottom && current.bottomUsed) {
    return { success: false, error: 'BOTTOM_QUOTA_EXHAUSTED', quota: current };
  }

  const memoryState = getLocalDevMemoryState();
  const existing = memoryState.vtoQuotas.get(tokenId) ?? {
    tokenId,
    topUsed: false,
    bottomUsed: false,
    updatedAt: new Date().toISOString(),
  };

  const newTopUsed = options.consumeTop ? true : existing.topUsed;
  const newBottomUsed = options.consumeBottom ? true : existing.bottomUsed;

  memoryState.vtoQuotas.set(tokenId, {
    ...existing,
    topUsed: newTopUsed,
    bottomUsed: newBottomUsed,
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    quota: {
      topUsed: newTopUsed,
      bottomUsed: newBottomUsed,
      topsRemaining: newTopUsed ? 0 : 1,
      bottomsRemaining: newBottomUsed ? 0 : 1,
      canTryTop: !newTopUsed,
      canTryBottom: !newBottomUsed,
    },
  };
}

export interface VtoPipelineInput {
  userPhotoUri: string;
  topProduct?: { id: string; imagePath: string; category: string } | null;
  bottomProduct?: { id: string; imagePath: string; category: string } | null;
}

export interface VtoPipelineResult {
  status: 'succeeded' | 'partial_success' | 'failed';
  finalImageUri: string | null;
  step1ImageUri?: string | null;
  quotaDeduction: { top: boolean; bottom: boolean };
  warningMessage?: string;
  errorMessage?: string;
  totalCostUsd: number;
  totalDurationMs: number;
}

export interface VtoChainingSubmitOutcome {
  kind?: 'completed' | 'processing' | 'failed';
  status?: VtoJobStatus;
  providerReference?: string;
  resultImageUri?: string;
  resultPath?: string | null;
  costEstimateUsd?: number;
  durationMs?: number;
  errorMessage?: string;
}

export interface VtoChainingPollOutcome {
  kind?: 'completed' | 'processing' | 'failed';
  status?: 'completed' | 'processing' | 'failed';
  resultImageUri?: string;
  outputDataUri?: string;
  resultPath?: string | null;
  durationMs?: number;
  errorMessage?: string;
  error?: string;
}

export interface VtoChainingProvider {
  submitTryOn(input: {
    personImagePath?: string;
    modelPhotoPath: string;
    garmentImagePath: string;
    category: string;
    idempotencyKey?: string;
  }): Promise<VtoChainingSubmitOutcome>;
  pollTryOn?(providerReference: string): Promise<VtoChainingPollOutcome>;
  checkTryOnStatus?(providerReference: string): Promise<VtoChainingPollOutcome>;
}

export interface VtoPipelineOptions {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export async function executeVtoPipeline(
  input: VtoPipelineInput,
  provider: VtoChainingProvider,
  options?: VtoPipelineOptions,
): Promise<VtoPipelineResult> {
  const currentPersonUri = input.userPhotoUri;
  let step1ImageUri: string | null = null;
  let totalCostUsd = 0;
  let totalDurationMs = 0;

  const runSingleStep = async (
    personUri: string,
    garmentPath: string,
    category: 'tops' | 'bottoms',
  ): Promise<{ ok: boolean; imageUri?: string; cost: number; duration: number; error?: string }> => {
    const outcome = await provider.submitTryOn({
      personImagePath: personUri,
      modelPhotoPath: personUri,
      garmentImagePath: garmentPath,
      category,
    });

    const isCompleted =
      outcome.kind === 'completed' || outcome.status === 'completed';
    const isProcessing =
      outcome.kind === 'processing' ||
      outcome.status === 'processing' ||
      outcome.status === 'queued';

    if (isCompleted) {
      return {
        ok: true,
        imageUri: outcome.resultImageUri ?? outcome.resultPath ?? undefined,
        cost: outcome.costEstimateUsd ?? 0.075,
        duration: outcome.durationMs ?? 0,
      };
    }

    if (isProcessing && outcome.providerReference) {
      const pollFn = provider.pollTryOn ?? provider.checkTryOnStatus;
      if (!pollFn) {
        return {
          ok: false,
          cost: outcome.costEstimateUsd ?? 0,
          duration: outcome.durationMs ?? 0,
          error: 'Polling not supported by provider',
        };
      }

      const pollIntervalMs =
        options?.pollIntervalMs ?? (process.env.NODE_ENV === 'test' ? 10 : 1500);
      const maxAttempts = options?.maxPollAttempts ?? 40;
      let attempts = 0;
      let lastPolledDuration = 0;

      while (attempts < maxAttempts) {
        attempts++;
        if (attempts > 1 && pollIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const polled = await pollFn(outcome.providerReference);
        lastPolledDuration = polled.durationMs ?? 0;

        const pollCompleted =
          polled.kind === 'completed' || polled.status === 'completed';
        if (pollCompleted) {
          return {
            ok: true,
            imageUri:
              polled.resultImageUri ??
              polled.outputDataUri ??
              polled.resultPath ??
              undefined,
            cost: outcome.costEstimateUsd ?? 0.075,
            duration: (outcome.durationMs ?? 0) + lastPolledDuration,
          };
        }

        const pollFailed =
          polled.kind === 'failed' || polled.status === 'failed';
        if (pollFailed) {
          return {
            ok: false,
            cost: outcome.costEstimateUsd ?? 0,
            duration: (outcome.durationMs ?? 0) + lastPolledDuration,
            error:
              polled.errorMessage ?? polled.error ?? 'Render gagal diproses',
          };
        }
      }

      return {
        ok: false,
        cost: outcome.costEstimateUsd ?? 0,
        duration: (outcome.durationMs ?? 0) + lastPolledDuration,
        error: 'Waktu proses Virtual Try-On habis (timeout)',
      };
    }

    return {
      ok: false,
      cost: 0,
      duration: outcome.durationMs ?? 0,
      error: outcome.errorMessage ?? 'Render gagal diproses',
    };
  };

  if (input.topProduct && !input.bottomProduct) {
    const res = await runSingleStep(currentPersonUri, input.topProduct.imagePath, 'tops');
    return {
      status: res.ok ? 'succeeded' : 'failed',
      finalImageUri: res.imageUri ?? null,
      quotaDeduction: { top: res.ok, bottom: false },
      errorMessage: res.error,
      totalCostUsd: res.cost,
      totalDurationMs: res.duration,
    };
  }

  if (!input.topProduct && input.bottomProduct) {
    const res = await runSingleStep(currentPersonUri, input.bottomProduct.imagePath, 'bottoms');
    return {
      status: res.ok ? 'succeeded' : 'failed',
      finalImageUri: res.imageUri ?? null,
      quotaDeduction: { top: false, bottom: res.ok },
      errorMessage: res.error,
      totalCostUsd: res.cost,
      totalDurationMs: res.duration,
    };
  }

  if (input.topProduct && input.bottomProduct) {
    const step1 = await runSingleStep(currentPersonUri, input.topProduct.imagePath, 'tops');
    totalCostUsd += step1.cost;
    totalDurationMs += step1.duration;

    if (!step1.ok || !step1.imageUri) {
      return {
        status: 'failed',
        finalImageUri: null,
        quotaDeduction: { top: false, bottom: false },
        errorMessage: step1.error ?? 'Render atasan gagal diproses.',
        totalCostUsd,
        totalDurationMs,
      };
    }

    step1ImageUri = step1.imageUri;

    const step2 = await runSingleStep(step1ImageUri, input.bottomProduct.imagePath, 'bottoms');
    totalCostUsd += step2.cost;
    totalDurationMs += step2.duration;

    if (!step2.ok || !step2.imageUri) {
      return {
        status: 'partial_success',
        finalImageUri: step1ImageUri,
        step1ImageUri,
        quotaDeduction: { top: true, bottom: false },
        warningMessage:
          'Atasan berhasil dipasang, namun render bawahan gagal diproses. Kuota bawahan Anda tetap utuh (1/1) dan dapat dicoba kembali.',
        totalCostUsd,
        totalDurationMs,
      };
    }

    return {
      status: 'succeeded',
      finalImageUri: step2.imageUri,
      step1ImageUri,
      quotaDeduction: { top: true, bottom: true },
      totalCostUsd,
      totalDurationMs,
    };
  }

  return {
    status: 'failed',
    finalImageUri: null,
    quotaDeduction: { top: false, bottom: false },
    errorMessage: 'Tidak ada produk yang dipilih.',
    totalCostUsd: 0,
    totalDurationMs: 0,
  };
}

export interface VtoJobRecord {
  id: string;
  tokenId: string;
  type: 'virtual_try_on';
  status: VtoJobStatus;
  attemptCount: number;
  tokenRecoveryStatus: TokenRecoveryStatus;
  input: {
    analysis_id: string;
    product_id: string;
    photo_path: string;
  };
  resultPath: string | null;
  provider: 'fashn';
  providerReference: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VtoRepository {
  listActiveProducts?(): Promise<ProductRecord[]>;
  findProductById(productId: string): Promise<ProductRecord | null>;
  findAnalysisById(analysisId: string): Promise<{ id: string; tokenId: string } | null>;
  findByTokenId(tokenId: string): Promise<VtoJobRecord | null>;
  findById(jobId: string): Promise<VtoJobRecord | null>;
  create(job: VtoJobRecord): Promise<VtoJobRecord>;
  update(
    jobId: string,
    patch: Partial<
      Pick<
        VtoJobRecord,
        | 'status'
        | 'attemptCount'
        | 'input'
        | 'resultPath'
        | 'providerReference'
        | 'tokenRecoveryStatus'
        | 'error'
        | 'updatedAt'
      >
    >,
  ): Promise<VtoJobRecord>;
  updateIfStatus?(
    jobId: string,
    expectedStatus: VtoJobStatus,
    patch: Partial<
      Pick<
        VtoJobRecord,
        | 'status'
        | 'attemptCount'
        | 'input'
        | 'resultPath'
        | 'providerReference'
        | 'tokenRecoveryStatus'
        | 'error'
        | 'updatedAt'
      >
    >,
  ): Promise<VtoJobRecord | null>;
  recordUsageEvent?(event: UsageEventRecord): Promise<void>;
}

export interface FashnVtoProvider {
  submitTryOn(input: {
    modelPhotoPath?: string;
    personImagePath?: string;
    modelImageDataUri?: string;
    garmentImagePath: string;
    category: string;
    idempotencyKey?: string;
  }): Promise<{
    providerReference: string;
    status: VtoJobStatus;
    resultPath?: string | null;
  }>;
  checkTryOnStatus?(
    providerReference: string,
  ): Promise<FashnPollOutcome>;
}

export interface VtoPhotoStorage {
  store(
    photo: ValidatedPhoto,
    kind: StoredPhotoKind,
  ): Promise<Pick<PhotoAsset, 'id' | 'objectPath'>>;
  delete?(asset: Pick<PhotoAsset, 'id' | 'objectPath'>): Promise<void>;
}

export interface VtoServiceOptions {
  createId?: () => string;
  now?: () => Date;
  provider?: FashnVtoProvider;
  photoStorage?: VtoPhotoStorage;
  consumeToken?: (tokenId: string) => Promise<unknown>;
}

export type CreateOrRetryVtoJobOutcome =
  | {
      ok: true;
      job: VtoJobRecord;
    }
  | {
      ok: false;
      code:
        | 'INVALID_PHOTO'
        | 'INVALID_PRODUCT'
        | 'JOB_NOT_FOUND'
        | 'TOKEN_CONSUMED';
    }
  | {
      ok: false;
      code: 'JOB_IN_PROGRESS' | 'RETRY_LIMIT_REACHED';
      job: VtoJobRecord;
    };

export type CreateVtoJobOutcome = CreateOrRetryVtoJobOutcome;

export function createFashnRestProvider(
  fetchImpl: typeof fetch = fetch,
): FashnVtoProvider {
  return {
    async submitTryOn(input) {
      let modelImage =
        input.modelImageDataUri ??
        input.modelPhotoPath ??
        input.personImagePath ??
        '';
      if (
        modelImage &&
        !modelImage.startsWith('http://') &&
        !modelImage.startsWith('https://') &&
        !modelImage.startsWith('data:')
      ) {
        try {
          const photoStorage = createSupabasePhotoStorage();
          const stored = await photoStorage.read(modelImage);
          if (stored) {
            modelImage = `data:${stored.mimeType};base64,${Buffer.from(stored.bytes).toString('base64')}`;
          }
        } catch {
          // ignore storage read failure, submitFashnTryOn will validate
        }
      }

      const result = await submitFashnTryOn(
        {
          ...input,
          modelImageDataUri: modelImage.startsWith('data:')
            ? modelImage
            : input.modelImageDataUri,
          modelPhotoPath: modelImage,
          category: input.category ?? 'tops',
        },
        { fetchImpl },
      );
      return {
        providerReference: result.providerReference,
        status: result.status,
        resultPath: result.resultPath,
      };
    },
    async checkTryOnStatus(providerReference) {
      return await pollFashnTryOnStatus(providerReference, { fetchImpl });
    },
  };
}

function normalizePrivateVtoResultPath(
  jobId: string,
  rawResultPath: string | null | undefined,
): string | null {
  if (!rawResultPath?.trim()) {
    return null;
  }
  const trimmed = rawResultPath.trim();
  if (trimmed.startsWith('private/')) {
    return trimmed;
  }
  return `private/vto/${jobId}.jpg`;
}

function decodeDataUriOrBase64(dataUriOrBase64: string): {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
} {
  const match = dataUriOrBase64.match(/^data:([^;]+);base64,(.+)$/s);
  let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  let base64 = dataUriOrBase64.trim();

  if (match) {
    const rawMime = match[1].toLowerCase();
    if (!ALLOWED_VTO_MIME_TYPES.includes(rawMime as typeof ALLOWED_VTO_MIME_TYPES[number])) {
      throw new Error(`INVALID_RESULT_PHOTO:unsupported_mime_type:${rawMime}`);
    }
    mimeType = rawMime as 'image/jpeg' | 'image/png' | 'image/webp';
    base64 = match[2].trim();
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_VTO_RESULT_BYTES) {
    throw new Error(`INVALID_RESULT_PHOTO:size_exceeded:${buffer.length}`);
  }
  return { bytes: new Uint8Array(buffer), mimeType };
}

async function resolveOutputBytes(
  outputDataUri: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}> {
  if (
    outputDataUri.startsWith('http://') ||
    outputDataUri.startsWith('https://')
  ) {
    const url = new URL(outputDataUri);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('INVALID_RESULT_PHOTO:unsupported_protocol');
    }
    // Block private IPs and metadata endpoints (SSRF protection)
    const hostname = url.hostname;
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '169.254.169.254',
      'metadata.google.internal',
      'metadata.azure.com',
    ];
    if (blockedHosts.includes(hostname)) {
      throw new Error('INVALID_RESULT_PHOTO:blocked_host');
    }
    // Block private IP ranges
    const privateIpRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
    ];
    if (privateIpRanges.some((r) => r.test(hostname))) {
      throw new Error('INVALID_RESULT_PHOTO:private_ip_blocked');
    }

    const res = await fetch(outputDataUri, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(`Failed to download result image: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_VTO_RESULT_BYTES) {
      throw new Error(`INVALID_RESULT_PHOTO:size_exceeded:${buf.byteLength}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const rawMime = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_VTO_MIME_TYPES.includes(rawMime as typeof ALLOWED_VTO_MIME_TYPES[number])) {
      throw new Error(`INVALID_RESULT_PHOTO:unsupported_mime_type:${rawMime}`);
    }
    const mimeType =
      rawMime === 'image/png' || rawMime === 'image/webp'
        ? rawMime
        : 'image/jpeg';
    return { bytes: new Uint8Array(buf), mimeType };
  }
  return decodeDataUriOrBase64(outputDataUri);
}

export function createVirtualTryOnService(
  repository: VtoRepository,
  options: VtoServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const provider = options.provider;

  const getPhotoStorage = () =>
    options.photoStorage ?? createSupabasePhotoStorage();
  const getConsumeToken = () =>
    options.consumeToken ??
    (async (tokenId: string) => {
      const tokenService = createSupabaseTokenService();
      await tokenService.consumeToken(tokenId);
    });

  async function listActiveProducts(): Promise<ProductRecord[]> {
    if (!repository.listActiveProducts) {
      return [];
    }
    const products = await repository.listActiveProducts();
    return products.filter((product) => product.isActive);
  }

  async function createOrRetryJob(input: {
    tokenId: string;
    analysisId: string;
    productId: string;
    photoPath: string;
  }): Promise<CreateOrRetryVtoJobOutcome> {
    const trimmedPhotoPath = input.photoPath?.trim();
    if (!trimmedPhotoPath) {
      return { ok: false, code: 'INVALID_PHOTO' };
    }

    const analysis = await repository.findAnalysisById(input.analysisId);
    if (!analysis || analysis.tokenId !== input.tokenId) {
      return { ok: false, code: 'JOB_NOT_FOUND' };
    }

    const product = await repository.findProductById(input.productId);
    if (!product || !product.isActive) {
      return { ok: false, code: 'INVALID_PRODUCT' };
    }

    const existingVto = await repository.findByTokenId(input.tokenId);
    if (existingVto) {
      if (existingVto.status === 'completed') {
        return { ok: false, code: 'TOKEN_CONSUMED' };
      }
      if (
        existingVto.status === 'queued' ||
        existingVto.status === 'processing'
      ) {
        return {
          ok: false,
          code: 'JOB_IN_PROGRESS',
          job: existingVto,
        };
      }
      if (existingVto.status === 'failed') {
        if (existingVto.attemptCount >= MAX_VTO_ATTEMPTS) {
          return {
            ok: false,
            code: 'RETRY_LIMIT_REACHED',
            job: existingVto,
          };
        }
        const timestamp = now().toISOString();
        const updated = await repository.update(existingVto.id, {
          attemptCount: existingVto.attemptCount + 1,
          status: 'queued',
          input: {
            analysis_id: input.analysisId,
            product_id: input.productId,
            photo_path: trimmedPhotoPath,
          },
          resultPath: null,
          providerReference: null,
          tokenRecoveryStatus: 'not_needed',
          error: null,
          updatedAt: timestamp,
        });
        return { ok: true, job: updated };
      }
    }

    const timestamp = now().toISOString();
    const job: VtoJobRecord = {
      id: createId(),
      tokenId: input.tokenId,
      type: 'virtual_try_on',
      status: 'queued',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: {
        analysis_id: input.analysisId,
        product_id: input.productId,
        photo_path: trimmedPhotoPath,
      },
      resultPath: null,
      provider: 'fashn',
      providerReference: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const created = await repository.create(job);
    return { ok: true, job: created };
  }

  async function processJob(jobId: string): Promise<VtoJobRecord> {
    const existing = await repository.findById(jobId);
    if (!existing) {
      throw new Error('JOB_NOT_FOUND');
    }

    const product = await repository.findProductById(
      existing.input.product_id,
    );
    if (!product || !product.isActive) {
      const recoveryStatus: TokenRecoveryStatus =
        existing.attemptCount < MAX_VTO_ATTEMPTS
          ? 'retryable'
          : 'manual_recovery_required';
      return await repository.update(jobId, {
        status: 'failed',
        tokenRecoveryStatus: recoveryStatus,
        error: 'INVALID_PRODUCT',
        updatedAt: now().toISOString(),
      });
    }

    const activeProvider = provider ?? createFashnRestProvider();
    try {
      const submission = await activeProvider.submitTryOn({
        modelPhotoPath: existing.input.photo_path,
        garmentImagePath: product.imagePath,
        category: product.category,
        idempotencyKey: `${existing.id}:${existing.attemptCount}`,
      });
      const timestamp = now().toISOString();
      const privatePath = normalizePrivateVtoResultPath(
        jobId,
        submission.resultPath,
      );

      if (submission.status === 'completed') {
        if (repository.recordUsageEvent) {
          await repository.recordUsageEvent({
            id: createId(),
            jobId,
            provider: 'fashn',
            feature: 'virtual_try_on',
            model: 'fashn-tryon-v1',
            inputTokens: null,
            outputTokens: null,
            estimatedCostIdr: FASHN_ESTIMATED_COST_IDR,
            status: 'completed',
            errorCode: null,
            createdAt: timestamp,
          });
        }

        if (options.consumeToken) {
          await options.consumeToken(existing.tokenId);
        }

        return await repository.update(jobId, {
          status: 'completed',
          providerReference: submission.providerReference,
          resultPath: privatePath,
          tokenRecoveryStatus: 'not_needed',
          error: null,
          updatedAt: timestamp,
        });
      }

      if (submission.status === 'failed') {
        const recoveryStatus: TokenRecoveryStatus =
          existing.attemptCount < MAX_VTO_ATTEMPTS
            ? 'retryable'
            : 'manual_recovery_required';

        return await repository.update(jobId, {
          status: 'failed',
          providerReference: submission.providerReference,
          resultPath: null,
          tokenRecoveryStatus: recoveryStatus,
          error: 'PROVIDER_ERROR',
          updatedAt: timestamp,
        });
      }

      return await repository.update(jobId, {
        status: 'processing',
        providerReference: submission.providerReference,
        resultPath: null,
        tokenRecoveryStatus: 'not_needed',
        error: null,
        updatedAt: timestamp,
      });
    } catch (error) {
      const timestamp = now().toISOString();
      const errorCode =
        error instanceof FashnProviderError ? error.code : 'PROVIDER_ERROR';

      if (repository.recordUsageEvent) {
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model:
            error instanceof FashnProviderError
              ? error.model
              : 'fashn-tryon-v1',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr: 0,
          status: 'failed',
          errorCode,
          createdAt: timestamp,
        });
      }

      const recoveryStatus: TokenRecoveryStatus =
        existing.attemptCount < MAX_VTO_ATTEMPTS
          ? 'retryable'
          : 'manual_recovery_required';

      return await repository.update(jobId, {
        status: 'failed',
        tokenRecoveryStatus: recoveryStatus,
        error:
          error instanceof FashnProviderError
            ? `${error.code}:${error.message}`
            : error instanceof Error
              ? error.message
              : 'PROVIDER_ERROR',
        updatedAt: timestamp,
      });
    }
  }

  // ponytail: poll-on-read with inline storage decode; upgrade to background worker and webhook ingestion when concurrency > 10 req/s
  async function syncJobStatus(
    jobId: string,
    tokenId?: string,
  ): Promise<VtoJobRecord> {
    const job = await repository.findById(jobId);
    if (!job || job.type !== 'virtual_try_on') {
      throw new Error('JOB_NOT_FOUND');
    }
    if (tokenId && job.tokenId !== tokenId) {
      throw new Error('JOB_NOT_FOUND');
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    if (job.status !== 'processing') {
      return job;
    }

    const elapsedMs = now().getTime() - Date.parse(job.updatedAt);
    if (elapsedMs >= VTO_JOB_TIMEOUT_MS) {
      const timestamp = now().toISOString();
      const recoveryStatus: TokenRecoveryStatus =
        job.attemptCount < MAX_VTO_ATTEMPTS
          ? 'retryable'
          : 'manual_recovery_required';

      const patch = {
        status: 'failed' as const,
        tokenRecoveryStatus: recoveryStatus,
        error: 'VTO generation timed out after 90 seconds',
        updatedAt: timestamp,
      };

      const updated = repository.updateIfStatus
        ? await repository.updateIfStatus(jobId, 'processing', patch)
        : await repository.update(jobId, patch);

      if (!updated) {
        return (await repository.findById(jobId))!;
      }

      if (repository.recordUsageEvent) {
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: 'fashn-tryon-v1',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr: 0,
          status: 'failed',
          errorCode: 'timeout',
          createdAt: timestamp,
        });
      }

      return updated;
    }

    const activeProvider = provider ?? createFashnRestProvider();
    if (!activeProvider.checkTryOnStatus || !job.providerReference) {
      return job;
    }

    const outcome = await activeProvider.checkTryOnStatus(
      job.providerReference,
    );

    if (outcome.status === 'processing') {
      return job;
    }

    if (outcome.status === 'completed') {
      const timestamp = now().toISOString();
      const decoded = await resolveOutputBytes(outcome.outputDataUri);
      const validation = await validatePhoto({
        bytes: decoded.bytes,
        declaredMimeType: decoded.mimeType,
      });

      if (!validation.ok) {
        const recoveryStatus: TokenRecoveryStatus =
          job.attemptCount < MAX_VTO_ATTEMPTS
            ? 'retryable'
            : 'manual_recovery_required';

        const patch = {
          status: 'failed' as const,
          tokenRecoveryStatus: recoveryStatus,
          error: `INVALID_RESULT_PHOTO:${validation.code}`,
          updatedAt: timestamp,
        };

        const updated = repository.updateIfStatus
          ? await repository.updateIfStatus(jobId, 'processing', patch)
          : await repository.update(jobId, patch);

        if (!updated) {
          return (await repository.findById(jobId))!;
        }

        return updated;
      }

      const photoStorage = getPhotoStorage();
      const vtoAsset = await photoStorage.store(validation, 'vtoResult');

      let updatedJob: VtoJobRecord | null = null;
      if (repository.updateIfStatus) {
        updatedJob = await repository.updateIfStatus(jobId, 'processing', {
          status: 'completed',
          resultPath: vtoAsset.objectPath,
          tokenRecoveryStatus: 'not_needed',
          error: null,
          updatedAt: timestamp,
        });
        if (!updatedJob) {
          if (photoStorage.delete) {
            await photoStorage.delete(vtoAsset).catch(() => {});
          }
          return (await repository.findById(jobId))!;
        }
      } else {
        updatedJob = await repository.update(jobId, {
          status: 'completed',
          resultPath: vtoAsset.objectPath,
          tokenRecoveryStatus: 'not_needed',
          error: null,
          updatedAt: timestamp,
        });
      }

      if (repository.recordUsageEvent) {
        const creditsUsed = outcome.creditsUsed ?? 1;
        const estimatedCostIdr = creditsUsed * FASHN_CREDIT_COST_IDR;
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: outcome.model ?? 'fashn-tryon-v1',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr,
          status: 'completed',
          errorCode: null,
          createdAt: timestamp,
        });
      }

      const consume = getConsumeToken();
      await consume(job.tokenId);
      return updatedJob;
    }

    if (outcome.status === 'failed') {
      const timestamp = now().toISOString();
      const recoveryStatus: TokenRecoveryStatus =
        job.attemptCount < MAX_VTO_ATTEMPTS
          ? 'retryable'
          : 'manual_recovery_required';

      const patch = {
        status: 'failed' as const,
        tokenRecoveryStatus: recoveryStatus,
        error: outcome.errorMessage || 'PROVIDER_ERROR',
        updatedAt: timestamp,
      };

      const updated = repository.updateIfStatus
        ? await repository.updateIfStatus(jobId, 'processing', patch)
        : await repository.update(jobId, patch);

      if (!updated) {
        return (await repository.findById(jobId))!;
      }

      if (repository.recordUsageEvent) {
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: outcome.model ?? 'fashn-tryon-v1',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr: 0,
          status: 'failed',
          errorCode: outcome.errorCode ?? 'provider_failed',
          createdAt: timestamp,
        });
      }

      return updated;
    }

    return job;
  }

  async function getJob(
    jobId: string,
    tokenId?: string,
  ): Promise<VtoJobRecord | null> {
    const job = await repository.findById(jobId);
    if (!job || job.type !== 'virtual_try_on') {
      return null;
    }
    if (tokenId && job.tokenId !== tokenId) {
      return null;
    }
    return job;
  }

  async function recordPipelineExecution(
    input: RecordPipelineExecutionInput,
  ): Promise<{ jobId: string }> {
    const timestamp = now().toISOString();
    const isSuccess =
      input.pipelineResult.status === 'succeeded' ||
      input.pipelineResult.status === 'partial_success';
    const status: VtoJobStatus = isSuccess ? 'completed' : 'failed';

    const existingJob = await repository.findByTokenId(input.tokenId);
    let jobId: string;

    if (existingJob) {
      jobId = existingJob.id;
      await repository.update(jobId, {
        status,
        attemptCount: existingJob.attemptCount + 1,
        resultPath: input.pipelineResult.finalImageUri ?? existingJob.resultPath,
        error: input.pipelineResult.errorMessage ?? null,
        updatedAt: timestamp,
      });
    } else {
      jobId = createId();
      await repository.create({
        id: jobId,
        tokenId: input.tokenId,
        type: 'virtual_try_on',
        status,
        attemptCount: 1,
        tokenRecoveryStatus: 'not_needed',
        input: {
          analysis_id: '',
          product_id: input.topProductId ?? input.bottomProductId ?? '',
          photo_path: input.userPhotoUri,
        },
        resultPath: input.pipelineResult.finalImageUri ?? null,
        provider: 'fashn',
        providerReference: null,
        error: input.pipelineResult.errorMessage ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    if (repository.recordUsageEvent) {
      const creditsUsed =
        (input.pipelineResult.quotaDeduction.top ? 1 : 0) +
        (input.pipelineResult.quotaDeduction.bottom ? 1 : 0);

      if (creditsUsed > 0) {
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: 'tryon-v1.6',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr: creditsUsed * FASHN_CREDIT_COST_IDR,
          status: 'completed',
          errorCode: null,
          createdAt: timestamp,
        });
      } else if (!isSuccess) {
        await repository.recordUsageEvent({
          id: createId(),
          jobId,
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: 'tryon-v1.6',
          inputTokens: null,
          outputTokens: null,
          estimatedCostIdr: 0,
          status: 'failed',
          errorCode: input.pipelineResult.errorMessage ?? 'PROVIDER_ERROR',
          createdAt: timestamp,
        });
      }
    }

    return { jobId };
  }

  return {
    listActiveProducts,
    createJob: createOrRetryJob,
    createOrRetryJob,
    processJob,
    syncJobStatus,
    getJob,
    recordPipelineExecution,
  };
}

function mapRowToVtoJob(row: Record<string, unknown>): VtoJobRecord {
  const resultObj = row.result as { result_path?: string } | null;
  return {
    id: String(row.id),
    tokenId: String(row.token_id),
    type: 'virtual_try_on',
    status: row.status as VtoJobStatus,
    attemptCount:
      typeof row.attempt_count === 'number' ? row.attempt_count : 1,
    tokenRecoveryStatus:
      (row.token_recovery_status as TokenRecoveryStatus) ?? 'not_needed',
    input: row.input as {
      analysis_id: string;
      product_id: string;
      photo_path: string;
    },
    resultPath: resultObj?.result_path ?? null,
    provider: 'fashn',
    providerReference: (row.provider_reference as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createInMemoryVtoRepository(): VtoRepository {
  const state = getLocalDevMemoryState();
  if (state.productsById.size === 0) {
    state.productsById.set('prod-active-1', {
      id: 'prod-active-1',
      name: 'Terracotta Linen Overshirt',
      brand: 'Flicks Essentials',
      category: 'tops',
      subcategory: 'overshirt',
      imagePath: 'catalog/terracotta-overshirt.jpg',
      sourceUrl: 'https://flicks.example/products/terracotta-overshirt',
      labels: { seasons: ['Warm Autumn'] },
      isActive: true,
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
    });
  }

  return {
    async listActiveProducts() {
      return Array.from(state.productsById.values())
        .filter((product) => product.isActive)
        .map((product) => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          imagePath: product.imagePath,
          sourceUrl: product.sourceUrl,
          labels: product.labels,
          isActive: product.isActive,
        }));
    },
    async findProductById(productId) {
      const product = state.productsById.get(productId);
      if (!product) return null;
      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        imagePath: product.imagePath,
        sourceUrl: product.sourceUrl,
        labels: product.labels,
        isActive: product.isActive,
      };
    },
    async findAnalysisById(analysisId) {
      const job = state.analysisJobsById.get(analysisId) as
        | { id: string; tokenId: string }
        | undefined;
      return job ? { id: job.id, tokenId: job.tokenId } : null;
    },
    async findByTokenId(tokenId) {
      for (const item of state.vtoJobsById.values()) {
        const job = item as VtoJobRecord;
        if (job.tokenId === tokenId) {
          return job;
        }
      }
      return null;
    },
    async findById(jobId) {
      return (state.vtoJobsById.get(jobId) as VtoJobRecord) ?? null;
    },
    async create(job) {
      state.vtoJobsById.set(job.id, job);
      return job;
    },
    async update(jobId, patch) {
      const existing = state.vtoJobsById.get(jobId) as VtoJobRecord | undefined;
      if (!existing) {
        throw new Error('JOB_NOT_FOUND');
      }
      const updated: VtoJobRecord = { ...existing, ...patch };
      state.vtoJobsById.set(jobId, updated);
      return updated;
    },
    async updateIfStatus(jobId, expectedStatus, patch) {
      const existing = state.vtoJobsById.get(jobId) as VtoJobRecord | undefined;
      if (!existing || existing.status !== expectedStatus) {
        return null;
      }
      const updated: VtoJobRecord = { ...existing, ...patch };
      state.vtoJobsById.set(jobId, updated);
      return updated;
    },
    async recordUsageEvent(event) {
      state.usageEvents.push(event);
    },
  };
}

export function createSupabaseVtoRepository(): VtoRepository {
  const client = createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return {
    async listActiveProducts() {
      const { data, error } = await client
        .from('products')
        .select('id, name, brand, category, image_path, source_url, labels, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        brand: row.brand ? String(row.brand) : null,
        category: String(row.category),
        imagePath: String(row.image_path),
        sourceUrl: row.source_url ? String(row.source_url) : null,
        labels: (row.labels as Record<string, unknown> | null) ?? null,
        isActive: Boolean(row.is_active),
      }));
    },
    async findProductById(productId) {
      const { data, error } = await client
        .from('products')
        .select('id, name, brand, category, image_path, source_url, labels, is_active')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        name: String(data.name),
        brand: data.brand ? String(data.brand) : null,
        category: String(data.category),
        imagePath: String(data.image_path),
        sourceUrl: data.source_url ? String(data.source_url) : null,
        labels: (data.labels as Record<string, unknown> | null) ?? null,
        isActive: Boolean(data.is_active),
      };
    },
    async findAnalysisById(analysisId) {
      const { data, error } = await client
        .from('jobs')
        .select('id, token_id')
        .eq('id', analysisId)
        .eq('type', 'analysis')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        tokenId: String(data.token_id),
      };
    },
    async findByTokenId(tokenId) {
      const { data, error } = await client
        .from('jobs')
        .select(
          'id, token_id, type, status, attempt_count, token_recovery_status, input, result, provider, provider_reference, error, created_at, updated_at',
        )
        .eq('token_id', tokenId)
        .eq('type', 'virtual_try_on')
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToVtoJob(data) : null;
    },
    async findById(jobId) {
      const { data, error } = await client
        .from('jobs')
        .select(
          'id, token_id, type, status, attempt_count, token_recovery_status, input, result, provider, provider_reference, error, created_at, updated_at',
        )
        .eq('id', jobId)
        .eq('type', 'virtual_try_on')
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToVtoJob(data) : null;
    },
    async create(job) {
      const { data, error } = await client
        .from('jobs')
        .insert({
          id: job.id,
          token_id: job.tokenId,
          type: job.type,
          status: job.status,
          attempt_count: job.attemptCount,
          token_recovery_status: job.tokenRecoveryStatus,
          input: job.input,
          result: job.resultPath ? { result_path: job.resultPath } : null,
          provider: job.provider,
          provider_reference: job.providerReference,
          error: job.error,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        })
        .select(
          'id, token_id, type, status, attempt_count, token_recovery_status, input, result, provider, provider_reference, error, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToVtoJob(data);
    },
    async update(jobId, patch) {
      const { data, error } = await client
        .from('jobs')
        .update({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.attemptCount !== undefined
            ? { attempt_count: patch.attemptCount }
            : {}),
          ...(patch.tokenRecoveryStatus
            ? { token_recovery_status: patch.tokenRecoveryStatus }
            : {}),
          ...(patch.input ? { input: patch.input } : {}),
          ...(patch.resultPath !== undefined
            ? {
                result: patch.resultPath
                  ? { result_path: patch.resultPath }
                  : null,
              }
            : {}),
          ...(patch.providerReference !== undefined
            ? { provider_reference: patch.providerReference }
            : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.updatedAt ? { updated_at: patch.updatedAt } : {}),
        })
        .eq('id', jobId)
        .eq('type', 'virtual_try_on')
        .select(
          'id, token_id, type, status, attempt_count, token_recovery_status, input, result, provider, provider_reference, error, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToVtoJob(data);
    },
    async updateIfStatus(jobId, expectedStatus, patch) {
      const { data, error } = await client
        .from('jobs')
        .update({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.attemptCount !== undefined
            ? { attempt_count: patch.attemptCount }
            : {}),
          ...(patch.tokenRecoveryStatus
            ? { token_recovery_status: patch.tokenRecoveryStatus }
            : {}),
          ...(patch.input ? { input: patch.input } : {}),
          ...(patch.resultPath !== undefined
            ? {
                result: patch.resultPath
                  ? { result_path: patch.resultPath }
                  : null,
              }
            : {}),
          ...(patch.providerReference !== undefined
            ? { provider_reference: patch.providerReference }
            : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.updatedAt ? { updated_at: patch.updatedAt } : {}),
        })
        .eq('id', jobId)
        .eq('type', 'virtual_try_on')
        .eq('status', expectedStatus)
        .select(
          'id, token_id, type, status, attempt_count, token_recovery_status, input, result, provider, provider_reference, error, created_at, updated_at',
        )
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToVtoJob(data) : null;
    },
    async recordUsageEvent(event) {
      const { error } = await client.from('usage_events').insert({
        id: event.id,
        job_id: event.jobId,
        provider: event.provider,
        feature: event.feature,
        model: event.model,
        input_tokens: event.inputTokens,
        output_tokens: event.outputTokens,
        estimated_cost_idr: event.estimatedCostIdr,
        status: event.status,
        error_code: event.errorCode,
        created_at: event.createdAt,
      });
      if (error) {
        throw error;
      }
    },
  };
}

export function createSupabaseVirtualTryOnService(
  options: VtoServiceOptions = {},
) {
  if (canUseLocalDevFallback()) {
    return createVirtualTryOnService(createInMemoryVtoRepository(), options);
  }
  return createVirtualTryOnService(createSupabaseVtoRepository(), options);
}
