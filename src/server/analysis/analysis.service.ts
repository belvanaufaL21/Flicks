import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { analyzeBodyShapeWithGemini } from '@/server/analysis/body-shape';
import { analyzePersonalColorWithGemini } from '@/server/analysis/personal-color';
import {
  validateAnalysisResultPayload,
  type AnalysisImageInput,
  type AnalysisResultPayload,
  type BodyShapeAnalysisResult,
  type BodyShapeCategory,
  type ConfidenceLevel,
  type GenderType,
  type PersonalColorAnalysisResult,
} from '@/server/analysis/schemas';
import {
  canUseLocalDevFallback,
  getLocalDevMemoryState,
  type UsageEventRecord,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';
import {
  recordOperationalEvent,
  trackPaidExecutionAndDetectSpike,
} from '@/server/monitoring/monitor';
import {
  estimateGeminiCostIdr,
  GeminiProviderError,
  type GeminiUsageMetadata,
} from '@/server/providers/gemini';
import { createSupabasePhotoStorage } from '@/server/storage/private-photo-storage';

export {
  validateAnalysisResultPayload,
  type AnalysisResultPayload,
  type BodyShapeAnalysisResult,
  type BodyShapeCategory,
  type ConfidenceLevel,
  type GenderType,
  type PersonalColorAnalysisResult,
};

export type AnalysisJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'needs_review';

export interface AnalysisModelMetadata {
  provider: 'gemini';
  model: string;
  personalColorAttempts?: number;
  bodyShapeAttempts?: number;
  estimatedCostIdr: number;
}

export interface AnalysisJobRecord {
  id: string;
  tokenId: string;
  type: 'analysis';
  status: AnalysisJobStatus;
  input: {
    photo_path: string;
    full_body_photo_path?: string;
    gender?: GenderType;
  };
  result: AnalysisResultPayload | null;
  provider: 'gemini';
  modelMetadata?: AnalysisModelMetadata | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisJobRepository {
  findByTokenId(tokenId: string): Promise<AnalysisJobRecord | null>;
  findById(jobId: string): Promise<AnalysisJobRecord | null>;
  create(job: AnalysisJobRecord): Promise<AnalysisJobRecord>;
  update(
    jobId: string,
    patch: Partial<
      Pick<
        AnalysisJobRecord,
        'status' | 'input' | 'result' | 'modelMetadata' | 'error' | 'updatedAt'
      >
    >,
  ): Promise<AnalysisJobRecord>;
  recordUsageEvent?(event: UsageEventRecord): Promise<void>;
}

export interface GeminiAnalysisProvider {
  analyzePhoto(
    photoPath: string,
    fullBodyPhotoPath?: string,
    gender?: GenderType,
  ): Promise<{
    status: 'completed' | 'needs_review';
    result: AnalysisResultPayload;
    modelMetadata?: AnalysisModelMetadata;
    usageEvents?: Array<{
      feature: 'personal_color' | 'body_shape';
      usage: GeminiUsageMetadata;
      status: 'completed' | 'needs_review';
    }>;
  }>;
}

export interface AnalysisServiceOptions {
  createId?: () => string;
  now?: () => Date;
  provider?: GeminiAnalysisProvider;
  photoReader?: (photoPath: string) => Promise<{
    bytes: Uint8Array;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  } | null>;
}

export type CreateAnalysisJobOutcome =
  | {
      ok: true;
      job: AnalysisJobRecord;
    }
  | {
      ok: false;
      code: 'INVALID_CONSENT' | 'INVALID_PHOTO' | 'TOKEN_CONSUMED';
    };

export function createGeminiRestProvider(
  fetchImpl: typeof fetch = fetch,
): GeminiAnalysisProvider {
  return {
    async analyzePhoto(photoPath: string) {
      const apiKey = getRequiredEnv('GEMINI_API_KEY');
      const model =
        process.env.GEMINI_MODEL?.trim().replace(/^models\//i, '') ||
        'gemini-3.5-flash-lite';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze personal color and body shape for private photo reference "${photoPath}". Return JSON matching { "personal_color": { "primary_season": "spring"|"summer"|"autumn"|"winter"|"unknown", "sub_season": string|null, "confidence_level": "high"|"medium"|"low", "recommended_colors": string[] }, "body_shape": { "category": "rectangle"|"pear"|"hourglass"|"inverted_triangle"|"unknown", "confidence_level": "high"|"medium"|"low", "styling_guidance": string[] } }.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Gemini response did not include structured content');
      }

      const parsed = validateAnalysisResultPayload(JSON.parse(rawText));
      if (!parsed) {
        throw new Error('Gemini output failed schema validation');
      }

      const needsReview =
        parsed.personal_color.status === 'needs_review' ||
        parsed.body_shape.status === 'needs_review' ||
        parsed.personal_color.primary_season === 'unknown' ||
        parsed.body_shape.category === 'unknown' ||
        parsed.personal_color.confidence_level === 'low' ||
        parsed.body_shape.confidence_level === 'low';

      const status = needsReview ? 'needs_review' : 'completed';
      const estimatedCostIdr = estimateGeminiCostIdr(null, null) * 2;

      return {
        status,
        result: parsed,
        modelMetadata: {
          provider: 'gemini',
          model,
          personalColorAttempts: 1,
          bodyShapeAttempts: 1,
          estimatedCostIdr,
        },
        usageEvents: [
          {
            feature: 'personal_color',
            usage: {
              model,
              inputTokens: null,
              outputTokens: null,
              estimatedCostIdr: estimateGeminiCostIdr(null, null),
              attempts: 1,
            },
            status: parsed.personal_color.status ?? status,
          },
          {
            feature: 'body_shape',
            usage: {
              model,
              inputTokens: null,
              outputTokens: null,
              estimatedCostIdr: estimateGeminiCostIdr(null, null),
              attempts: 1,
            },
            status: parsed.body_shape.status ?? status,
          },
        ],
      };
    },
  };
}

export function createModularGeminiAnalysisProvider(options: {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  photoReader?: AnalysisServiceOptions['photoReader'];
} = {}): GeminiAnalysisProvider {
  const readPhoto =
    options.photoReader ??
    (async (path: string) => await createSupabasePhotoStorage().read(path));

  return {
    async analyzePhoto(
      photoPath: string,
      fullBodyPhotoPath?: string,
      gender?: GenderType,
    ) {
      const facePhoto = await readPhoto(photoPath);
      const bodyPath = fullBodyPhotoPath?.trim() || photoPath;
      const bodyPhoto =
        bodyPath === photoPath ? facePhoto : await readPhoto(bodyPath);

      const faceInput: AnalysisImageInput = {
        photoPath,
        ...(facePhoto
          ? { bytes: facePhoto.bytes, mimeType: facePhoto.mimeType }
          : {}),
      };
      const bodyInput: AnalysisImageInput = {
        photoPath: bodyPath,
        ...(bodyPhoto
          ? { bytes: bodyPhoto.bytes, mimeType: bodyPhoto.mimeType }
          : {}),
      };

      const [personalColorOutcome, bodyShapeOutcome] = await Promise.all([
        analyzePersonalColorWithGemini(faceInput, {
          fetchImpl: options.fetchImpl,
          maxRetries: options.maxRetries,
          timeoutMs: options.timeoutMs,
        }),
        analyzeBodyShapeWithGemini(bodyInput, {
          gender,
          fetchImpl: options.fetchImpl,
          maxRetries: options.maxRetries,
          timeoutMs: options.timeoutMs,
        }),
      ]);

      const personalColorStatus =
        personalColorOutcome.data.status ?? 'completed';
      const bodyShapeStatus = bodyShapeOutcome.data.status ?? 'completed';
      const combinedStatus =
        personalColorStatus === 'needs_review' ||
        bodyShapeStatus === 'needs_review'
          ? 'needs_review'
          : 'completed';

      const totalEstimatedCost =
        Math.round(
          (personalColorOutcome.usage.estimatedCostIdr +
            bodyShapeOutcome.usage.estimatedCostIdr) *
            100,
        ) / 100;

      return {
        status: combinedStatus,
        result: {
          personal_color: personalColorOutcome.data,
          body_shape: bodyShapeOutcome.data,
        },
        modelMetadata: {
          provider: 'gemini',
          model: personalColorOutcome.usage.model,
          personalColorAttempts: personalColorOutcome.usage.attempts,
          bodyShapeAttempts: bodyShapeOutcome.usage.attempts,
          estimatedCostIdr: totalEstimatedCost,
        },
        usageEvents: [
          {
            feature: 'personal_color',
            usage: personalColorOutcome.usage,
            status: personalColorStatus,
          },
          {
            feature: 'body_shape',
            usage: bodyShapeOutcome.usage,
            status: bodyShapeStatus,
          },
        ],
      };
    },
  };
}

export function createAnalysisService(
  repository: AnalysisJobRepository,
  options: AnalysisServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const provider = options.provider;

  return {
    async createJob(input: {
      tokenId: string;
      photoPath: string;
      fullBodyPhotoPath?: string;
      gender?: GenderType;
      consent: boolean;
    }): Promise<CreateAnalysisJobOutcome> {
      if (input.consent !== true) {
        return { ok: false, code: 'INVALID_CONSENT' };
      }

      const trimmedPath = input.photoPath?.trim();
      if (!trimmedPath) {
        return { ok: false, code: 'INVALID_PHOTO' };
      }

      const existing = await repository.findByTokenId(input.tokenId);
      if (existing && existing.status !== 'failed') {
        return { ok: false, code: 'TOKEN_CONSUMED' };
      }

      const timestamp = now().toISOString();
      const trimmedBodyPath = input.fullBodyPhotoPath?.trim();
      const nextInput = {
        photo_path: trimmedPath,
        ...(trimmedBodyPath ? { full_body_photo_path: trimmedBodyPath } : {}),
        ...(input.gender ? { gender: input.gender } : {}),
      };

      if (existing && existing.status === 'failed') {
        const retried = await repository.update(existing.id, {
          status: 'queued',
          input: nextInput,
          result: null,
          error: null,
          updatedAt: timestamp,
        });
        return { ok: true, job: retried };
      }

      const queuedJob: AnalysisJobRecord = {
        id: createId(),
        tokenId: input.tokenId,
        type: 'analysis',
        status: 'queued',
        input: nextInput,
        result: null,
        provider: 'gemini',
        modelMetadata: null,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const created = await repository.create(queuedJob);
      return { ok: true, job: created };
    },

    async processJob(jobId: string): Promise<AnalysisJobRecord> {
      const existing = await repository.findById(jobId);
      if (!existing) {
        throw new Error('JOB_NOT_FOUND');
      }

      const activeProvider =
        provider ??
        createModularGeminiAnalysisProvider({
          photoReader: options.photoReader,
        });
      await repository.update(jobId, {
        status: 'processing',
        updatedAt: now().toISOString(),
      });

      try {
        const outcome = await activeProvider.analyzePhoto(
          existing.input.photo_path,
          existing.input.full_body_photo_path,
          existing.input.gender,
        );
        const timestamp = now().toISOString();
        const totalCostIdr =
          outcome.usageEvents?.reduce(
            (sum, ev) => sum + ev.usage.estimatedCostIdr,
            0,
          ) ?? 0;
        trackPaidExecutionAndDetectSpike('analysis', totalCostIdr);

        if (repository.recordUsageEvent && outcome.usageEvents) {
          for (const event of outcome.usageEvents) {
            await repository.recordUsageEvent({
              id: createId(),
              jobId,
              provider: 'gemini',
              feature: event.feature,
              model: event.usage.model,
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              estimatedCostIdr: event.usage.estimatedCostIdr,
              status: event.status,
              errorCode: null,
              createdAt: timestamp,
            });
          }
        }

        return await repository.update(jobId, {
          status: outcome.status,
          result: outcome.result,
          modelMetadata: outcome.modelMetadata ?? null,
          error: null,
          updatedAt: timestamp,
        });
      } catch (error) {
        const timestamp = now().toISOString();
        const errorCode =
          error instanceof GeminiProviderError ? error.code : 'PROVIDER_ERROR';
        const model =
          error instanceof GeminiProviderError
            ? error.model
            : process.env.GEMINI_MODEL?.trim().replace(/^models\//i, '') ||
              'gemini-3.5-flash-lite';

        recordOperationalEvent({
          category: 'provider_job_failure',
          severity: 'error',
          code: errorCode,
          message:
            error instanceof Error ? error.message : 'Gemini analysis failed',
          metadata: { provider: 'gemini', jobId, model },
        });

        if (repository.recordUsageEvent) {
          await repository.recordUsageEvent({
            id: createId(),
            jobId,
            provider: 'gemini',
            feature: 'personal_color',
            model,
            inputTokens: null,
            outputTokens: null,
            estimatedCostIdr: 0,
            status: 'failed',
            errorCode,
            createdAt: timestamp,
          });
        }

        return await repository.update(jobId, {
          status: 'failed',
          error:
            error instanceof GeminiProviderError
              ? `${error.code}:${error.message}`
              : error instanceof Error
                ? error.message
                : 'PROVIDER_ERROR',
          updatedAt: timestamp,
        });
      }
    },

    async getJob(
      jobId: string,
      tokenId?: string,
    ): Promise<AnalysisJobRecord | null> {
      const job = await repository.findById(jobId);
      if (!job || job.type !== 'analysis') {
        return null;
      }
      if (tokenId && job.tokenId !== tokenId) {
        return null;
      }
      return job;
    },
  };
}

function mapRowToAnalysisJob(row: Record<string, unknown>): AnalysisJobRecord {
  return {
    id: String(row.id),
    tokenId: String(row.token_id),
    type: 'analysis',
    status: row.status as AnalysisJobStatus,
    input: row.input as {
      photo_path: string;
      full_body_photo_path?: string;
      gender?: GenderType;
    },
    result: (row.result as AnalysisResultPayload | null) ?? null,
    provider: 'gemini',
    modelMetadata:
      (row.model_metadata as AnalysisModelMetadata | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createInMemoryAnalysisJobRepository(): AnalysisJobRepository {
  const state = getLocalDevMemoryState();

  return {
    async findByTokenId(tokenId) {
      for (const item of state.analysisJobsById.values()) {
        const job = item as AnalysisJobRecord;
        if (job.tokenId === tokenId) {
          return job;
        }
      }
      return null;
    },
    async findById(jobId) {
      return (state.analysisJobsById.get(jobId) as AnalysisJobRecord) ?? null;
    },
    async create(job) {
      state.analysisJobsById.set(job.id, job);
      return job;
    },
    async update(jobId, patch) {
      const existing = state.analysisJobsById.get(jobId) as
        | AnalysisJobRecord
        | undefined;
      if (!existing) {
        throw new Error('JOB_NOT_FOUND');
      }
      const updated: AnalysisJobRecord = { ...existing, ...patch };
      state.analysisJobsById.set(jobId, updated);
      return updated;
    },
    async recordUsageEvent(event) {
      state.usageEvents.push(event);
    },
  };
}

export function createSupabaseAnalysisJobRepository(): AnalysisJobRepository {
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
    async findByTokenId(tokenId) {
      const { data, error } = await client
        .from('jobs')
        .select(
          'id, token_id, type, status, input, result, provider, model_metadata, error, created_at, updated_at',
        )
        .eq('token_id', tokenId)
        .eq('type', 'analysis')
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToAnalysisJob(data) : null;
    },
    async findById(jobId) {
      const { data, error } = await client
        .from('jobs')
        .select(
          'id, token_id, type, status, input, result, provider, model_metadata, error, created_at, updated_at',
        )
        .eq('id', jobId)
        .eq('type', 'analysis')
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToAnalysisJob(data) : null;
    },
    async create(job) {
      const { data, error } = await client
        .from('jobs')
        .insert({
          id: job.id,
          token_id: job.tokenId,
          type: job.type,
          status: job.status,
          input: job.input,
          result: job.result,
          provider: job.provider,
          model_metadata: job.modelMetadata ?? null,
          error: job.error,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        })
        .select(
          'id, token_id, type, status, input, result, provider, model_metadata, error, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToAnalysisJob(data);
    },
    async update(jobId, patch) {
      const { data, error } = await client
        .from('jobs')
        .update({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.input ? { input: patch.input } : {}),
          ...(patch.result !== undefined ? { result: patch.result } : {}),
          ...(patch.modelMetadata !== undefined
            ? { model_metadata: patch.modelMetadata }
            : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.updatedAt ? { updated_at: patch.updatedAt } : {}),
        })
        .eq('id', jobId)
        .eq('type', 'analysis')
        .select(
          'id, token_id, type, status, input, result, provider, model_metadata, error, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToAnalysisJob(data);
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

export function createSupabaseAnalysisService(
  options: AnalysisServiceOptions = {},
) {
  if (canUseLocalDevFallback()) {
    return createAnalysisService(
      createInMemoryAnalysisJobRepository(),
      options,
    );
  }
  return createAnalysisService(createSupabaseAnalysisJobRepository(), options);
}
