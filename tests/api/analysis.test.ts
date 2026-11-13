import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseTokenService, createSupabaseAnalysisService } =
  vi.hoisted(() => ({
    createSupabaseTokenService: vi.fn(),
    createSupabaseAnalysisService: vi.fn(),
  }));

vi.mock('../../src/server/tokens/token.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/server/tokens/token.service')>();
  return {
    ...actual,
    createSupabaseTokenService,
  };
});

vi.mock('../../src/server/analysis/analysis.service', () => ({
  createSupabaseAnalysisService,
}));

import { POST } from '../../src/app/api/analysis/route';
import { GET } from '../../src/app/api/analysis/[jobId]/route';

describe('POST /api/analysis and GET /api/analysis/[jobId]', () => {
  const reserveToken = vi.fn();
  const verifyToken = vi.fn();
  const createJob = vi.fn();
  const processJob = vi.fn();
  const getJob = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    reserveToken.mockReset();
    verifyToken.mockReset();
    createJob.mockReset();
    processJob.mockReset();
    getJob.mockReset();
    createSupabaseTokenService.mockReturnValue({ reserveToken, verifyToken });
    createSupabaseAnalysisService.mockReturnValue({
      createJob,
      processJob,
      getJob,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('requires consent and a valid reserved token before creating an analysis job', async () => {
    const noConsentRes = await POST(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ photo_path: 'face/id', consent: false }),
      }),
    );

    expect(noConsentRes.status).toBe(400);
    await expect(noConsentRes.json()).resolves.toMatchObject({
      error: 'INVALID_CONSENT',
    });
    expect(reserveToken).not.toHaveBeenCalled();

    reserveToken.mockResolvedValueOnce({
      ok: true,
      token: { id: 'token-1', status: 'reserved' },
    });
    createJob.mockResolvedValueOnce({
      ok: true,
      job: { id: 'job-123', status: 'queued' },
    });

    const okRes = await POST(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: 'face/id',
          gender: 'female',
          consent: true,
        }),
      }),
    );

    expect(okRes.status).toBe(201);
    await expect(okRes.json()).resolves.toEqual({
      job_id: 'job-123',
      status: 'queued',
    });
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'token-1',
        photoPath: 'face/id',
        gender: 'female',
        consent: true,
      }),
    );
  });

  it('requires gender to be selected before creating an analysis job', async () => {
    const noGenderRes = await POST(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          authorization: 'Bearer tok_valid',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: 'face/id',
          consent: true,
        }),
      }),
    );

    expect(noGenderRes.status).toBe(400);
    await expect(noGenderRes.json()).resolves.toMatchObject({
      error: 'INVALID_GENDER',
    });
    expect(reserveToken).not.toHaveBeenCalled();
  });

  it('rejects invalid gender values', async () => {
    const badGenderRes = await POST(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          authorization: 'Bearer tok_valid',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: 'face/id',
          consent: true,
          gender: 'other',
        }),
      }),
    );

    expect(badGenderRes.status).toBe(400);
    await expect(badGenderRes.json()).resolves.toMatchObject({
      error: 'INVALID_GENDER',
    });
    expect(reserveToken).not.toHaveBeenCalled();
  });

  it('polls analysis job status and returns completed result payload', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: true,
      token: { id: 'token-1', status: 'reserved' },
    });
    getJob.mockResolvedValueOnce({
      id: 'job-123',
      tokenId: 'token-1',
      type: 'analysis',
      status: 'completed',
      result: {
        personal_color: {
          primary_season: 'autumn',
          sub_season: 'deep autumn',
          confidence_level: 'medium',
          recommended_colors: ['#A0522D'],
        },
        body_shape: {
          category: 'rectangle',
          confidence_level: 'medium',
          styling_guidance: ['Add belts'],
        },
      },
    });

    const response = await GET(
      new Request('http://localhost/api/analysis/job-123', {
        headers: { authorization: 'Bearer valid-token' },
      }),
      { params: { jobId: 'job-123' } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job_id: 'job-123',
      status: 'completed',
    });
  });
});
