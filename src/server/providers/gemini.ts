import 'server-only';
import { getRequiredEnv } from '@/server/env';
import type { AnalysisImageInput } from '@/server/analysis/schemas';

export type GeminiErrorCode =
  | 'timeout'
  | 'http_error'
  | 'empty_response'
  | 'invalid_json'
  | 'schema_invalid';

export class GeminiProviderError extends Error {
  readonly code: GeminiErrorCode;
  readonly attempts: number;
  readonly model: string;

  constructor(
    code: GeminiErrorCode,
    message: string,
    options: { attempts: number; model: string; cause?: unknown },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'GeminiProviderError';
    this.code = code;
    this.attempts = options.attempts;
    this.model = options.model;
  }
}

export interface GeminiUsageMetadata {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostIdr: number;
  attempts: number;
}

export interface GeminiStructuredCallOptions<T> {
  prompt: string;
  image: AnalysisImageInput;
  validate: (parsed: unknown) => T | null;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  model?: string;
  apiKey?: string;
}

export interface GeminiStructuredCallResult<T> {
  data: T;
  usage: GeminiUsageMetadata;
}

// PRD Section I.1 baseline: Rp198 for ~20,000 input tokens + ~4,000 output tokens across both modules (~Rp99 per module)
export function estimateGeminiCostIdr(
  inputTokens: number | null,
  outputTokens: number | null,
): number {
  if (inputTokens === null && outputTokens === null) {
    return 99;
  }
  const inCount = Math.max(0, inputTokens ?? 0);
  const outCount = Math.max(0, outputTokens ?? 0);
  const estimated = (inCount / 20_000) * 99 + (outCount / 4_000) * 99;
  return Math.max(1, Math.round(estimated * 100) / 100);
}

export function parseGeminiModels(rawModel?: string): string[] {
  // ponytail: comma-separated fallback list; upgrade to dynamic latency-aware routing if model pool expands
  const list = (rawModel ?? process.env.GEMINI_MODEL ?? '')
    .split(',')
    .map((m) => m.trim().replace(/^models\//i, ''))
    .filter(Boolean);
  return list.length > 0 ? list : ['gemini-3.5-flash-lite'];
}

export function normalizeGeminiModelName(rawModel?: string): string {
  return parseGeminiModels(rawModel)[0];
}

export async function callGeminiStructured<T>(
  options: GeminiStructuredCallOptions<T>,
): Promise<GeminiStructuredCallResult<T>> {
  const apiKey = options.apiKey ?? getRequiredEnv('GEMINI_API_KEY');
  const models = parseGeminiModels(
    options.model ?? process.env.GEMINI_MODEL,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  // Bounded retry: default 1 retry (max 2 total attempts)
  const maxRetries = Math.min(Math.max(options.maxRetries ?? 1, 0), 2);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxAttempts = maxRetries + 1;

  const parts: Array<Record<string, unknown>> = [{ text: options.prompt }];
  if (options.image.bytes && options.image.mimeType) {
    parts.push({
      inline_data: {
        mime_type: options.image.mimeType,
        data: Buffer.from(options.image.bytes).toString('base64'),
      },
    });
  }

  let lastError: GeminiProviderError | null = null;
  let totalAttempts = 0;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      totalAttempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                responseMimeType: 'application/json',
              },
            }),
          });
        } catch (err) {
          const isAbort =
            (err instanceof Error && err.name === 'AbortError') ||
            controller.signal.aborted;
          throw new GeminiProviderError(
            isAbort ? 'timeout' : 'http_error',
            isAbort
              ? `Gemini request timed out after ${timeoutMs}ms`
              : 'Gemini network request failed',
            { attempts: totalAttempts, model, cause: err },
          );
        }

        if (!response.ok) {
          let upstreamDetail = '';
          try {
            const errJson = (await response.json()) as {
              error?: { message?: string };
            };
            if (errJson.error?.message) {
              upstreamDetail = ` (${errJson.error.message})`;
            }
          } catch {
            // ignore non-JSON error body
          }
          throw new GeminiProviderError(
            'http_error',
            `Gemini request failed with status ${response.status}${upstreamDetail}`,
            { attempts: totalAttempts, model },
          );
        }

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };

        const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new GeminiProviderError(
            'empty_response',
            'Gemini response did not include structured content',
            { attempts: totalAttempts, model },
          );
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawText);
        } catch (err) {
          throw new GeminiProviderError(
            'invalid_json',
            'Gemini returned malformed JSON',
            { attempts: totalAttempts, model, cause: err },
          );
        }

        const validated = options.validate(parsedJson);
        if (!validated) {
          throw new GeminiProviderError(
            'schema_invalid',
            'Gemini output failed schema validation',
            { attempts: totalAttempts, model },
          );
        }

        const inputTokens =
          typeof payload.usageMetadata?.promptTokenCount === 'number'
            ? payload.usageMetadata.promptTokenCount
            : null;
        const outputTokens =
          typeof payload.usageMetadata?.candidatesTokenCount === 'number'
            ? payload.usageMetadata.candidatesTokenCount
            : null;

        return {
          data: validated,
          usage: {
            model,
            inputTokens,
            outputTokens,
            estimatedCostIdr: estimateGeminiCostIdr(inputTokens, outputTokens),
            attempts: totalAttempts,
          },
        };
      } catch (err) {
        lastError =
          err instanceof GeminiProviderError
            ? err
            : new GeminiProviderError(
                'http_error',
                err instanceof Error ? err.message : 'Unknown Gemini error',
                { attempts: totalAttempts, model, cause: err },
              );
        if (
          lastError.message.includes('503') ||
          lastError.message.includes('404') ||
          lastError.message.includes('429')
        ) {
          break;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError!;
}
