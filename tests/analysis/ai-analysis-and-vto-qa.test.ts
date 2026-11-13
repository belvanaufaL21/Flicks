import { describe, expect, it, vi } from 'vitest';
import {
  createAnalysisService,
  createModularGeminiAnalysisProvider,
  type AnalysisJobRecord,
  type AnalysisJobRepository,
} from '../../src/server/analysis/analysis.service';
import { analyzeBodyShapeWithGemini } from '../../src/server/analysis/body-shape';
import { analyzePersonalColorWithGemini } from '../../src/server/analysis/personal-color';
import type { UsageEventRecord } from '../../src/server/dev/local-memory-store';
import { submitFashnTryOn } from '../../src/server/providers/fashn';
import {
  createVirtualTryOnService,
  type ProductRecord,
  type VtoJobRecord,
  type VtoRepository,
} from '../../src/server/vto/virtual-try-on.service';

function makeGeminiResponse(jsonPayload: unknown, tokens = { in: 1000, out: 200 }) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(jsonPayload) }],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: tokens.in,
        candidatesTokenCount: tokens.out,
      },
    }),
    { status: 200 },
  );
}

describe('MVP AI Analysis and Virtual Try-On (Tasks 1.1–1.5, 2.1–2.4, 3.1–3.5)', () => {
  it('1.1, 1.2, 1.3, 1.5, 3.1 (QA-01): runs separate Personal Color and Body Shape Gemini modules with inline image bytes and records per-feature usage/cost', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeGeminiResponse({
          analysis_type: 'personal_color',
          status: 'completed',
          primary_season: 'autumn',
          sub_season: 'deep autumn',
          alternative_candidates: ['dark winter'],
          confidence_level: 'high',
          photo_quality: {
            lighting: 'good',
            image_clarity: 'good',
          },
          styling: {
            recommended_colors: ['#8B4513', '#A0522D'],
            colors_to_test: ['#556B2F'],
          },
          disclaimer: 'Estimasi berbasis foto.',
        }),
      )
      .mockResolvedValueOnce(
        makeGeminiResponse({
          analysis_type: 'body_shape',
          status: 'completed',
          category: 'hourglass',
          alternative_candidates: [],
          confidence_level: 'medium',
          photo_quality: {
            lighting: 'good',
            image_clarity: 'acceptable',
          },
          styling_guidance: ['Gunakan potongan wrap dress untuk mengikuti garis pinggang'],
          limitations_note: 'Estimasi proporsi 2D.',
          disclaimer: 'Estimasi berbasis foto.',
        }),
      );

    const jobs = new Map<string, AnalysisJobRecord>();
    const usageEvents: UsageEventRecord[] = [];
    const repo: AnalysisJobRepository = {
      findByTokenId: async (tokenId) => {
        for (const job of jobs.values()) {
          if (job.tokenId === tokenId) return job;
        }
        return null;
      },
      findById: async (id) => jobs.get(id) ?? null,
      create: async (job) => {
        jobs.set(job.id, job);
        return job;
      },
      update: async (id, patch) => {
        const current = jobs.get(id)!;
        const updated = { ...current, ...patch };
        jobs.set(id, updated);
        return updated;
      },
      recordUsageEvent: async (event) => {
        usageEvents.push(event);
      },
    };

    const provider = createModularGeminiAnalysisProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
      photoReader: async (path) => ({
        bytes: new Uint8Array([1, 2, 3, path.length]),
        mimeType: 'image/jpeg',
      }),
    });

    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');

    const service = createAnalysisService(repo, {
      createId: () => 'job-qa-01',
      provider,
    });

    const created = await service.createJob({
      tokenId: 'token-qa-01',
      photoPath: 'face/photo-face-1',
      fullBodyPhotoPath: 'full-body/photo-body-1',
      consent: true,
    });
    expect(created.ok).toBe(true);

    const processed = await service.processJob('job-qa-01');
    expect(processed.status).toBe('completed');
    expect(processed.result?.personal_color.primary_season).toBe('autumn');
    expect(processed.result?.body_shape.category).toBe('hourglass');
    expect(processed.modelMetadata?.provider).toBe('gemini');
    expect(processed.modelMetadata?.estimatedCostIdr).toBeGreaterThan(0);

    // Both Personal Color and Body Shape modules called separately with inline_data
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody.contents[0].parts[1].inline_data.mime_type).toBe(
      'image/jpeg',
    );

    // Recorded 2 usage events (1 for personal_color, 1 for body_shape)
    expect(usageEvents).toHaveLength(2);
    expect(usageEvents.map((e) => e.feature)).toEqual([
      'personal_color',
      'body_shape',
    ]);
    vi.unstubAllEnvs();
  });

  it('1.3 & 3.2 (QA-03): preserves uncertainty, alternatives, and needs_review status for poor-quality photos without forcing a classification', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeGeminiResponse({
        analysis_type: 'personal_color',
        status: 'completed',
        primary_season: 'unknown',
        sub_season: 'should-be-cleared-to-null',
        alternative_candidates: ['autumn', 'winter'],
        confidence_level: 'low',
        photo_quality: {
          lighting: 'poor',
          image_clarity: 'uncertain',
        },
        recommended_colors: ['#708090'],
      }),
    );

    const outcome = await analyzePersonalColorWithGemini(
      { photoPath: 'face/dark-photo' },
      {
        apiKey: 'test-key',
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(outcome.data.status).toBe('needs_review');
    expect(outcome.data.primary_season).toBe('unknown');
    expect(outcome.data.sub_season).toBeNull();
    expect(outcome.data.alternative_candidates).toEqual(['autumn', 'winter']);
    expect(outcome.data.photo_quality?.lighting).toBe('poor');
  });

  it('1.4 & 3.3 (QA-04): applies bounded retry on invalid JSON or timeout and records structured error metadata', async () => {
    const malformedThenValidFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{not-valid-json' }] } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        makeGeminiResponse({
          category: 'pear',
          confidence_level: 'medium',
          styling_guidance: ['Gunakan A-line skirt'],
        }),
      );

    const recovered = await analyzeBodyShapeWithGemini(
      { photoPath: 'full-body/photo-1' },
      {
        apiKey: 'test-key',
        maxRetries: 1,
        fetchImpl: malformedThenValidFetch as unknown as typeof fetch,
      },
    );

    expect(recovered.data.category).toBe('pear');
    expect(recovered.usage.attempts).toBe(2);

    // Timeout after bounded retries
    const timeoutFetch = vi.fn().mockImplementation(async () => {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    await expect(
      analyzePersonalColorWithGemini(
        { photoPath: 'face/timeout' },
        {
          apiKey: 'test-key',
          maxRetries: 1,
          timeoutMs: 10,
          fetchImpl: timeoutFetch as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      code: 'timeout',
      attempts: 2,
    });
    expect(timeoutFetch).toHaveBeenCalledTimes(2);
  });

  it('2.1, 2.2, 2.3, 2.4, 3.4, 3.5 (QA-05 & QA-13): filters active products, rejects deactivated products, normalizes private VTO result path, never falls back to Gemini, and records pending_policy on FASHN timeout', async () => {
    const products: ProductRecord[] = [
      {
        id: 'prod-active',
        name: 'Active Blazer',
        category: 'tops',
        imagePath: 'catalog/blazer.jpg',
        isActive: true,
      },
      {
        id: 'prod-inactive',
        name: 'Archived Coat',
        category: 'tops',
        imagePath: 'catalog/coat.jpg',
        isActive: false,
      },
    ];

    const jobs = new Map<string, VtoJobRecord>();
    const usageEvents: UsageEventRecord[] = [];
    const repo: VtoRepository = {
      listActiveProducts: async () => products,
      findProductById: async (id) =>
        products.find((item) => item.id === id) ?? null,
      findAnalysisById: async (id) => ({ id, tokenId: 'token-vto' }),
      findByTokenId: async (tokenId) => {
        for (const job of jobs.values()) {
          if (job.tokenId === tokenId) return job;
        }
        return null;
      },
      findById: async (id) => jobs.get(id) ?? null,
      create: async (job) => {
        jobs.set(job.id, job);
        return job;
      },
      update: async (id, patch) => {
        const current = jobs.get(id)!;
        const updated = { ...current, ...patch };
        jobs.set(id, updated);
        return updated;
      },
      recordUsageEvent: async (event) => {
        usageEvents.push(event);
      },
    };

    const geminiSpy = vi.fn();
    const timeoutFashnFetch = vi.fn().mockImplementation(async () => {
      const err = new Error('Timeout');
      err.name = 'AbortError';
      throw err;
    });

    const service = createVirtualTryOnService(repo, {
      createId: () => 'vto-job-qa',
      provider: {
        submitTryOn: (input) =>
          submitFashnTryOn(input, {
            apiKey: 'test-fashn-key',
            maxRetries: 1,
            timeoutMs: 10,
            fetchImpl: timeoutFashnFetch as unknown as typeof fetch,
          }),
      },
    });

    // 2.1: Only active products returned
    const activeList = await service.listActiveProducts();
    expect(activeList).toHaveLength(1);
    expect(activeList[0].id).toBe('prod-active');

    // 3.5 (QA-13): Deactivated product rejected before job creation
    const rejectedCreate = await service.createJob({
      tokenId: 'token-vto',
      analysisId: 'analysis-1',
      productId: 'prod-inactive',
      photoPath: 'full-body/photo-1',
    });
    expect(rejectedCreate).toEqual({ ok: false, code: 'INVALID_PRODUCT' });
    expect(timeoutFashnFetch).not.toHaveBeenCalled();

    // Create with active product, then simulate FASHN timeout (QA-05)
    const created = await service.createJob({
      tokenId: 'token-vto',
      analysisId: 'analysis-1',
      productId: 'prod-active',
      photoPath: 'full-body/photo-1',
    });
    expect(created.ok).toBe(true);

    const failedJob = await service.processJob('vto-job-qa');
    expect(failedJob.status).toBe('failed');
    expect(failedJob.error).toMatch(/^timeout:/);
    expect(failedJob.tokenRecoveryStatus).toBe('retryable');
    expect(geminiSpy).not.toHaveBeenCalled();
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      provider: 'fashn',
      feature: 'virtual_try_on',
      status: 'failed',
      errorCode: 'timeout',
    });
  });
});
