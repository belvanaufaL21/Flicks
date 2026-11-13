import { describe, expect, it, vi } from 'vitest';
import {
  createAnalysisService,
  createGeminiRestProvider,
  type AnalysisJobRecord,
  type AnalysisJobRepository,
} from '../../src/server/analysis/analysis.service';

function createInMemoryAnalysisRepo(): AnalysisJobRepository {
  const jobs = new Map<string, AnalysisJobRecord>();
  return {
    async findByTokenId(tokenId) {
      for (const job of jobs.values()) {
        if (job.tokenId === tokenId) return job;
      }
      return null;
    },
    async findById(jobId) {
      return jobs.get(jobId) ?? null;
    },
    async create(job) {
      jobs.set(job.id, job);
      return job;
    },
    async update(jobId, patch) {
      const existing = jobs.get(jobId);
      if (!existing) throw new Error('not found');
      const updated: AnalysisJobRecord = { ...existing, ...patch };
      jobs.set(jobId, updated);
      return updated;
    },
  };
}

describe('analysis.service (Tasks 3.1, 3.3, 3.4)', () => {
  it('creates an analysis job, calls Gemini, and updates status + structured result', async () => {
    const repo = createInMemoryAnalysisRepo();
    const provider = {
      analyzePhoto: vi.fn().mockResolvedValue({
        status: 'completed' as const,
        result: {
          personal_color: {
            primary_season: 'autumn' as const,
            sub_season: 'deep autumn',
            confidence_level: 'high' as const,
            recommended_colors: ['#A0522D', '#8B4513'],
          },
          body_shape: {
            category: 'rectangle' as const,
            confidence_level: 'medium' as const,
            styling_guidance: ['Add belts to define waist'],
          },
        },
      }),
    };
    const service = createAnalysisService(repo, {
      createId: () => 'job-1',
      now: () => new Date('2026-10-25T16:00:00.000Z'),
      provider,
    });

    const created = await service.createJob({
      tokenId: 'token-1',
      photoPath: 'face/photo-1',
      consent: true,
    });
    expect(created).toEqual({
      ok: true,
      job: expect.objectContaining({
        id: 'job-1',
        status: 'queued',
      }),
    });

    const duplicate = await service.createJob({
      tokenId: 'token-1',
      photoPath: 'face/photo-1',
      consent: true,
    });
    expect(duplicate).toEqual({
      ok: false,
      code: 'TOKEN_CONSUMED',
    });

    const processed = await service.processJob('job-1');
    expect(processed.status).toBe('completed');
    expect(processed.result?.personal_color.primary_season).toBe('autumn');

    const polled = await service.getJob('job-1', 'token-1');
    expect(polled?.status).toBe('completed');
    expect(await service.getJob('job-1', 'other-token')).toBeNull();
  });

  it('parses structured Gemini REST output and marks uncertain results as needs_review', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      personal_color: {
                        primary_season: 'unknown',
                        sub_season: null,
                        confidence_level: 'low',
                        recommended_colors: ['#808080'],
                      },
                      body_shape: {
                        category: 'rectangle',
                        confidence_level: 'medium',
                        styling_guidance: ['Try structured jackets'],
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = createGeminiRestProvider(fetchMock as unknown as typeof fetch);
    const outcome = await provider.analyzePhoto('face/photo-1');

    expect(outcome.status).toBe('needs_review');
    expect(outcome.result.personal_color.primary_season).toBe('unknown');
    vi.unstubAllEnvs();
  });
});
