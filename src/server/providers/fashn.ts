import 'server-only';
import { getRequiredEnv } from '@/server/env';

export const FASHN_DEFAULT_MODEL = 'tryon-v1.6';
// 1 credit = Rp 142.264,12 / 100 credits ≈ Rp 1.423
export const FASHN_CREDIT_COST_IDR = 1_423;
export const FASHN_ESTIMATED_COST_IDR = FASHN_CREDIT_COST_IDR; // alias

export type FashnCategory = 'tops' | 'bottoms' | 'one-pieces' | 'auto';

export function normalizeFashnCategory(rawCategory: string | null | undefined): FashnCategory {
  if (!rawCategory) return 'auto';
  const c = rawCategory.trim().toLowerCase();
  if (['tops', 'shirt', 'top', 'outerwear', 'blazer', 'coat', 'jacket'].includes(c)) return 'tops';
  if (['bottoms', 'pants', 'skirt', 'bottom', 'shorts', 'trousers'].includes(c)) return 'bottoms';
  if (['one-pieces', 'dress', 'jumpsuit', 'one_piece', 'romper'].includes(c)) return 'one-pieces';
  return 'auto';
}

export type FashnErrorCode =
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'out_of_credits'
  | 'image_load_error'
  | 'pose_error'
  | 'content_moderation_error'
  | 'pipeline_error'
  | 'provider_failed';

export class FashnProviderError extends Error {
  readonly code: FashnErrorCode;
  readonly attempts: number;
  readonly model: string;

  constructor(
    code: FashnErrorCode,
    message: string,
    options: { attempts: number; model: string; cause?: unknown },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'FashnProviderError';
    this.code = code;
    this.attempts = options.attempts;
    this.model = options.model;
  }
}

export interface FashnUsageMetadata {
  model: string;
  estimatedCostIdr: number;
  attempts: number;
}

export interface FashnSubmitInput {
  modelImageDataUri?: string;
  garmentImage?: string;
  category: string;
  mode?: 'performance' | 'balanced' | 'quality';
  idempotencyKey?: string;
  // Aliases for backwards compatibility with virtual-try-on.service.ts and ai-analysis-and-vto-qa.test.ts
  modelPhotoPath?: string;
  garmentImagePath?: string;
}

export interface FashnSubmitOutput {
  providerReference: string;
  status: 'processing' | 'completed' | 'failed';
  resultPath?: string | null;
  usage: {
    model: string;
    attempts: number;
    estimatedCostIdr?: number;
  };
}

export type FashnPollOutcome =
  | {
      status: 'processing';
      providerStatus: 'starting' | 'in_queue' | 'processing';
    }
  | {
      status: 'completed';
      outputDataUri: string;
      creditsUsed: number;
      estimatedCostIdr: number;
      model: string;
    }
  | {
      status: 'failed';
      errorCode: FashnErrorCode;
      errorMessage: string;
      model: string;
    };

export interface FashnCallOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  apiKey?: string;
  model?: string;
}

export async function submitFashnTryOn(
  input: FashnSubmitInput,
  options: FashnCallOptions = {},
): Promise<FashnSubmitOutput> {
  const apiKey = options.apiKey ?? getRequiredEnv('FASHN_API_KEY');
  const model = options.model ?? FASHN_DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = Math.min(Math.max(options.maxRetries ?? 1, 0), 2);
  const timeoutMs = options.timeoutMs ?? 25_000;
  const maxAttempts = maxRetries + 1;
  const category = normalizeFashnCategory(input.category);
  const modelImage = input.modelImageDataUri ?? input.modelPhotoPath ?? '';
  const garmentImage = input.garmentImage ?? input.garmentImagePath ?? '';

  let lastError: FashnProviderError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetchImpl('https://api.fashn.ai/v1/run', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            model_name: model,
            inputs: {
              model_image: modelImage,
              garment_image: garmentImage,
              category,
              mode: input.mode ?? 'quality',
              output_format: 'jpeg',
              return_base64: true,
            },
            mode: input.mode ?? 'quality',
            output_format: 'jpeg',
            return_base64: true,
          }),
        });
      } catch (err) {
        const isAbort =
          (err instanceof Error && err.name === 'AbortError') ||
          controller.signal.aborted;
        throw new FashnProviderError(
          isAbort ? 'timeout' : 'http_error',
          isAbort ? `FASHN request timed out after ${timeoutMs}ms` : 'FASHN network request failed',
          { attempts: attempt, model, cause: err },
        );
      }

      if (!response.ok) {
        if (response.status === 402) {
          throw new FashnProviderError('out_of_credits', 'FASHN account out of credits', {
            attempts: attempt,
            model,
          });
        }
        if (response.status >= 400 && response.status < 500) {
          throw new FashnProviderError('http_error', `FASHN client error ${response.status}`, {
            attempts: attempt,
            model,
          });
        }
        throw new FashnProviderError('http_error', `FASHN server error ${response.status}`, {
          attempts: attempt,
          model,
        });
      }

      const payload = (await response.json()) as { id?: string; error?: string | null };
      if (!payload.id) {
        throw new FashnProviderError('invalid_response', 'FASHN response missing job id', {
          attempts: attempt,
          model,
        });
      }

      return {
        providerReference: payload.id,
        status: 'processing',
        resultPath: null,
        usage: { model, attempts: attempt, estimatedCostIdr: FASHN_ESTIMATED_COST_IDR },
      };
    } catch (err) {
      lastError =
        err instanceof FashnProviderError
          ? err
          : new FashnProviderError(
              'http_error',
              err instanceof Error ? err.message : 'Unknown FASHN error',
              { attempts: attempt, model, cause: err },
            );
      // Do not retry client 4xx or out_of_credits errors
      if (lastError.code === 'out_of_credits' || lastError.message.includes('client error')) {
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError!;
}

// ponytail: synchronous polling loop over HTTP status; upgrade to webhooks when async callback infrastructure is provisioned
export async function pollFashnTryOnStatus(
  providerReference: string,
  options: FashnCallOptions = {},
): Promise<FashnPollOutcome> {
  const apiKey = options.apiKey ?? getRequiredEnv('FASHN_API_KEY');
  const model = options.model ?? FASHN_DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.fashn.ai/v1/status/${encodeURIComponent(providerReference)}`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        status: 'failed',
        errorCode: response.status === 402 ? 'out_of_credits' : 'http_error',
        errorMessage: `Status check failed with HTTP ${response.status}`,
        model,
      };
    }

    const payload = (await response.json()) as {
      id?: string;
      status?: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
      output?: string[];
      error?: { name?: string; message?: string } | string | null;
    };

    if (payload.status === 'completed') {
      if (payload.output?.[0]) {
        const creditsHeader = response.headers.get('x-fashn-credits-used');
        const parsed = creditsHeader !== null ? Number(creditsHeader) : NaN;
        const creditsUsed = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
        return {
          status: 'completed',
          outputDataUri: payload.output[0],
          creditsUsed,
          estimatedCostIdr: creditsUsed * FASHN_CREDIT_COST_IDR,
          model,
        };
      }
      return {
        status: 'failed',
        errorCode: 'invalid_response',
        errorMessage: 'FASHN prediction completed without output',
        model,
      };
    }

    if (payload.status === 'failed') {
      const errName = typeof payload.error === 'object' ? payload.error?.name : '';
      const errMsg =
        typeof payload.error === 'object'
          ? payload.error?.message ?? 'FASHN prediction failed'
          : String(payload.error ?? 'FASHN prediction failed');

      let errorCode: FashnErrorCode = 'provider_failed';
      if (errName === 'PoseError') errorCode = 'pose_error';
      else if (errName === 'ImageLoadError') errorCode = 'image_load_error';
      else if (errName === 'ContentModerationError') errorCode = 'content_moderation_error';
      else if (errName === 'PipelineError') errorCode = 'pipeline_error';

      return {
        status: 'failed',
        errorCode,
        errorMessage: errMsg,
        model,
      };
    }

    return {
      status: 'processing',
      providerStatus: payload.status ?? 'processing',
    };
  } catch (err) {
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
    return {
      status: 'failed',
      errorCode: isAbort ? 'timeout' : 'http_error',
      errorMessage: isAbort ? `Status check timed out after ${timeoutMs}ms` : 'Status network error',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

