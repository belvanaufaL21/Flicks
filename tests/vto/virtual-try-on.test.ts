import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASHN_CREDIT_COST_IDR } from '../../src/server/providers/fashn';
import {
  createVirtualTryOnService,
  MAX_VTO_ATTEMPTS,
  VTO_JOB_TIMEOUT_MS,
  type VtoJobRecord,
  type VtoRepository,
} from '../../src/server/vto/virtual-try-on.service';

const { createSupabaseTokenService, createSupabaseVirtualTryOnService } =
  vi.hoisted(() => ({
    createSupabaseTokenService: vi.fn(),
    createSupabaseVirtualTryOnService: vi.fn(),
  }));

vi.mock('../../src/server/tokens/token.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/server/tokens/token.service')>();
  return {
    ...actual,
    createSupabaseTokenService,
  };
});

vi.mock('../../src/server/vto/virtual-try-on.service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/server/vto/virtual-try-on.service')
    >();
  return {
    ...actual,
    createSupabaseVirtualTryOnService,
    sanitizeErrorForClient: actual.sanitizeErrorForClient,
  };
});

import { POST } from '../../src/app/api/virtual-try-on/route';
import { GET } from '../../src/app/api/virtual-try-on/[jobId]/route';

describe('virtual-try-on service and endpoints (Tasks 3.2, 3.3, 3.4)', () => {
  it('rejects inactive products before calling FASHN and creates VTO job for active products', async () => {
    const jobs = new Map<string, VtoJobRecord>();
    let active = false;
    const repo: VtoRepository = {
      findProductById: vi.fn().mockImplementation(async (id) => ({
        id,
        name: 'Linen Shirt',
        category: 'tops',
        imagePath: 'catalog/shirt.png',
        isActive: active,
      })),
      findAnalysisById: vi.fn().mockResolvedValue({
        id: 'analysis-1',
        tokenId: 'token-1',
      }),
      findByTokenId: vi.fn().mockImplementation(async (tokenId) => {
        for (const job of jobs.values()) {
          if (job.tokenId === tokenId) return job;
        }
        return null;
      }),
      findById: vi.fn().mockImplementation(async (id) => jobs.get(id) ?? null),
      create: vi.fn().mockImplementation(async (job) => {
        jobs.set(job.id, job);
        return job;
      }),
      update: vi.fn().mockImplementation(async (id, patch) => {
        const existing = jobs.get(id)!;
        const updated = { ...existing, ...patch };
        jobs.set(id, updated);
        return updated;
      }),
    };
    const provider = {
      submitTryOn: vi.fn().mockResolvedValue({
        providerReference: 'fashn-job-1',
        status: 'completed' as const,
        resultPath: 'private/vto/result-1.jpg',
      }),
    };
    const service = createVirtualTryOnService(repo, {
      createId: () => 'vto-1',
      now: () => new Date('2026-10-25T16:30:00.000Z'),
      provider,
    });

    const rejected = await service.createJob({
      tokenId: 'token-1',
      analysisId: 'analysis-1',
      productId: 'prod-1',
      photoPath: 'full-body/photo-1',
    });
    expect(rejected).toEqual({ ok: false, code: 'INVALID_PRODUCT' });
    expect(provider.submitTryOn).not.toHaveBeenCalled();

    active = true;
    const created = await service.createJob({
      tokenId: 'token-1',
      analysisId: 'analysis-1',
      productId: 'prod-1',
      photoPath: 'full-body/photo-1',
    });
    expect(created.ok).toBe(true);

    const processed = await service.processJob('vto-1');
    expect(processed.status).toBe('completed');
    expect(processed.resultPath).toBe('private/vto/result-1.jpg');
    expect(provider.submitTryOn).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'vto-1:1',
      }),
    );

    const jobRecord = jobs.get('vto-1')!;
    jobs.set('vto-1', { ...jobRecord, attemptCount: 2, status: 'queued' });
    await service.processJob('vto-1');
    expect(provider.submitTryOn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: 'vto-1:2',
      }),
    );
  });

  describe('POST /api/virtual-try-on and GET /api/virtual-try-on/[jobId]', () => {
    const reserveToken = vi.fn();
    const consumeToken = vi.fn();
    const verifyToken = vi.fn();
    const createJob = vi.fn();
    const createOrRetryJob = vi.fn();
    const processJob = vi.fn();
    const getJob = vi.fn();
    const syncJobStatus = vi.fn();

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
      vi.stubEnv('FASHN_API_KEY', 'test-fashn-api-key');
      reserveToken.mockReset();
      consumeToken.mockReset();
      verifyToken.mockReset();
      createJob.mockReset();
      createOrRetryJob.mockReset();
      processJob.mockReset();
      getJob.mockReset();
      syncJobStatus.mockReset();
      createSupabaseTokenService.mockReturnValue({
        reserveToken,
        consumeToken,
        verifyToken,
      });
      createSupabaseVirtualTryOnService.mockReturnValue({
        createJob,
        createOrRetryJob,
        processJob,
        getJob,
        syncJobStatus,
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('returns 503 SERVICE_UNAVAILABLE when FASHN_API_KEY is not set and does not reserve token', async () => {
      vi.stubEnv('FASHN_API_KEY', '');

      const postRes = await POST(
        new Request('http://localhost/api/virtual-try-on', {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          }),
        }),
      );

      expect(postRes.status).toBe(503);
      await expect(postRes.json()).resolves.toEqual({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Virtual try-on provider is not configured',
      });
      expect(reserveToken).not.toHaveBeenCalled();
    });

    it('reserves token with allowReserved: true, does NOT call consumeToken, and returns 201 with job recovery fields', async () => {
      reserveToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      createOrRetryJob.mockResolvedValueOnce({
        ok: true,
        job: {
          id: 'vto-1',
          status: 'queued',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
        },
      });
      processJob.mockResolvedValueOnce({
        id: 'vto-1',
        status: 'processing',
        attemptCount: 1,
        tokenRecoveryStatus: 'not_needed',
      });

      const postRes = await POST(
        new Request('http://localhost/api/virtual-try-on', {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          }),
        }),
      );

      expect(postRes.status).toBe(201);
      await expect(postRes.json()).resolves.toEqual({
        job_id: 'vto-1',
        status: 'processing',
        attempt_count: 1,
        max_attempts: 3,
        token_recovery_status: 'not_needed',
      });
      expect(reserveToken).toHaveBeenCalledWith('valid-token', {
        allowReserved: true,
      });
      expect(consumeToken).not.toHaveBeenCalled();
      expect(createOrRetryJob).toHaveBeenCalledWith({
        tokenId: 'token-1',
        analysisId: 'analysis-1',
        productId: 'prod-1',
        photoPath: 'full-body/photo-1',
      });
      expect(processJob).toHaveBeenCalledWith('vto-1');
    });

    it('returns 409 JOB_IN_PROGRESS when job is active (queued or processing)', async () => {
      reserveToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      createOrRetryJob.mockResolvedValueOnce({
        ok: false,
        code: 'JOB_IN_PROGRESS',
        job: { id: 'vto-1', status: 'processing' },
      });

      const postRes = await POST(
        new Request('http://localhost/api/virtual-try-on', {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          }),
        }),
      );

      expect(postRes.status).toBe(409);
      await expect(postRes.json()).resolves.toEqual({
        error: 'JOB_IN_PROGRESS',
        message: 'Virtual try-on is currently processing',
      });
      expect(consumeToken).not.toHaveBeenCalled();
    });

    it('returns 403 RETRY_LIMIT_REACHED when 3 attempts have failed', async () => {
      reserveToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      createOrRetryJob.mockResolvedValueOnce({
        ok: false,
        code: 'RETRY_LIMIT_REACHED',
        job: { id: 'vto-1', attemptCount: 3 },
      });

      const postRes = await POST(
        new Request('http://localhost/api/virtual-try-on', {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          }),
        }),
      );

      expect(postRes.status).toBe(403);
      await expect(postRes.json()).resolves.toEqual({
        error: 'RETRY_LIMIT_REACHED',
        message: 'Maximum retry limit reached for this session',
      });
      expect(consumeToken).not.toHaveBeenCalled();
    });

    it('returns 403 TOKEN_CONSUMED when token was already used', async () => {
      reserveToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      createOrRetryJob.mockResolvedValueOnce({
        ok: false,
        code: 'TOKEN_CONSUMED',
      });

      const postRes = await POST(
        new Request('http://localhost/api/virtual-try-on', {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          }),
        }),
      );

      expect(postRes.status).toBe(403);
      await expect(postRes.json()).resolves.toEqual({
        error: 'TOKEN_CONSUMED',
        message: 'Token has already been used for virtual try-on',
      });
    });

    it('calls syncJobStatus and returns job with result_path and recovery fields', async () => {
      verifyToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      syncJobStatus.mockResolvedValueOnce({
        id: 'vto-1',
        tokenId: 'token-1',
        type: 'virtual_try_on',
        status: 'completed',
        resultPath: 'private/vto/result-1.jpg',
        attemptCount: 1,
        tokenRecoveryStatus: 'not_needed',
      });

      const getRes = await GET(
        new Request('http://localhost/api/virtual-try-on/vto-1', {
          headers: { authorization: 'Bearer valid-token' },
        }),
        { params: { jobId: 'vto-1' } },
      );

      expect(getRes.status).toBe(200);
      await expect(getRes.json()).resolves.toEqual({
        job_id: 'vto-1',
        status: 'completed',
        result_path: 'private/vto/result-1.jpg',
        attempt_count: 1,
        max_attempts: 3,
        token_recovery_status: 'not_needed',
      });
      expect(syncJobStatus).toHaveBeenCalledWith('vto-1', 'token-1');
    });

    it('calls syncJobStatus and returns error_message on failed job', async () => {
      verifyToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      syncJobStatus.mockResolvedValueOnce({
        id: 'vto-1',
        tokenId: 'token-1',
        type: 'virtual_try_on',
        status: 'failed',
        resultPath: null,
        attemptCount: 2,
        tokenRecoveryStatus: 'retryable',
        error: 'Model pose could not be detected',
      });

      const getRes = await GET(
        new Request('http://localhost/api/virtual-try-on/vto-1', {
          headers: { authorization: 'Bearer valid-token' },
        }),
        { params: { jobId: 'vto-1' } },
      );

      expect(getRes.status).toBe(200);
      await expect(getRes.json()).resolves.toEqual({
        job_id: 'vto-1',
        status: 'failed',
        attempt_count: 2,
        max_attempts: 3,
        token_recovery_status: 'retryable',
              error_message: 'Virtual try-on failed',
      });
    });

    it('returns 404 JOB_NOT_FOUND when syncJobStatus throws JOB_NOT_FOUND', async () => {
      verifyToken.mockResolvedValueOnce({
        ok: true,
        token: { id: 'token-1', status: 'reserved' },
      });
      syncJobStatus.mockRejectedValueOnce(new Error('JOB_NOT_FOUND'));

      const getRes = await GET(
        new Request('http://localhost/api/virtual-try-on/vto-missing', {
          headers: { authorization: 'Bearer valid-token' },
        }),
        { params: { jobId: 'vto-missing' } },
      );

      expect(getRes.status).toBe(404);
      await expect(getRes.json()).resolves.toEqual({
        error: 'JOB_NOT_FOUND',
        message: 'Job ID does not exist',
      });
    });
  });

  describe('VirtualTryOnService state machine (Task 3)', () => {
    async function createValidJpeg(): Promise<Uint8Array> {
      const buffer = await sharp({
        create: {
          width: 512,
          height: 768,
          channels: 3,
          background: { r: 120, g: 90, b: 160 },
        },
      })
        .jpeg()
        .toBuffer();
      return new Uint8Array(buffer);
    }

    function createTestRepo(initialJobs: VtoJobRecord[] = []) {
      const jobs = new Map<string, VtoJobRecord>(
        initialJobs.map((j) => [j.id, { ...j }]),
      );
      const usageEvents: unknown[] = [];
      const repo: VtoRepository = {
        findProductById: vi.fn().mockImplementation(async (id) => ({
          id,
          name: 'Linen Shirt',
          category: 'tops',
          imagePath: 'catalog/shirt.png',
          isActive: true,
        })),
        findAnalysisById: vi.fn().mockResolvedValue({
          id: 'analysis-1',
          tokenId: 'token-1',
        }),
        findByTokenId: vi.fn().mockImplementation(async (tokenId) => {
          for (const job of jobs.values()) {
            if (job.tokenId === tokenId) return job;
          }
          return null;
        }),
        findById: vi.fn().mockImplementation(async (id) => jobs.get(id) ?? null),
        create: vi.fn().mockImplementation(async (job) => {
          jobs.set(job.id, { ...job });
          return job;
        }),
        update: vi.fn().mockImplementation(async (id, patch) => {
          const existing = jobs.get(id);
          if (!existing) throw new Error('JOB_NOT_FOUND');
          const updated = { ...existing, ...patch };
          jobs.set(id, updated);
          return updated;
        }),
        updateIfStatus: vi
          .fn()
          .mockImplementation(async (id, expectedStatus, patch) => {
            const existing = jobs.get(id);
            if (!existing || existing.status !== expectedStatus) return null;
            const updated = { ...existing, ...patch };
            jobs.set(id, updated);
            return updated;
          }),
        recordUsageEvent: vi.fn().mockImplementation(async (event) => {
          usageEvents.push(event);
        }),
      };
      return { repo, jobs, usageEvents };
    }

    it('exports MAX_VTO_ATTEMPTS = 3 and VTO_JOB_TIMEOUT_MS = 90_000', () => {
      expect(MAX_VTO_ATTEMPTS).toBe(3);
      expect(VTO_JOB_TIMEOUT_MS).toBe(90_000);
    });

    describe('createOrRetryJob', () => {
      it('creates a new queued job with attemptCount 1 and tokenRecoveryStatus not_needed', async () => {
        const { repo } = createTestRepo();
        const service = createVirtualTryOnService(repo, {
          createId: () => 'job-1',
          now: () => new Date('2026-10-25T16:00:00.000Z'),
        });

        const result = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-1',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.job).toMatchObject({
            id: 'job-1',
            tokenId: 'token-1',
            status: 'queued',
            attemptCount: 1,
            tokenRecoveryStatus: 'not_needed',
            resultPath: null,
            error: null,
          });
        }
      });

      it('returns JOB_IN_PROGRESS if an active job is queued or processing', async () => {
        const baseJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'queued',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: null,
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };

        // Queued
        const { repo, jobs } = createTestRepo([baseJob]);
        const service = createVirtualTryOnService(repo);
        const queuedRes = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-1',
        });
        expect(queuedRes).toEqual({
          ok: false,
          code: 'JOB_IN_PROGRESS',
          job: expect.objectContaining({ id: 'job-1', status: 'queued' }),
        });

        // Processing
        jobs.set('job-1', { ...baseJob, status: 'processing' });
        const procRes = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-1',
        });
        expect(procRes).toEqual({
          ok: false,
          code: 'JOB_IN_PROGRESS',
          job: expect.objectContaining({ id: 'job-1', status: 'processing' }),
        });
      });

      it('returns TOKEN_CONSUMED if existing job is completed', async () => {
        const completedJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'completed',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: 'vto/result-1',
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([completedJob]);
        const service = createVirtualTryOnService(repo);

        const result = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-1',
        });
        expect(result).toEqual({ ok: false, code: 'TOKEN_CONSUMED' });
      });

      it('returns RETRY_LIMIT_REACHED if attemptCount >= 3 on failed job', async () => {
        const failedJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'failed',
          attemptCount: 3,
          tokenRecoveryStatus: 'manual_recovery_required',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: 'Provider error',
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([failedJob]);
        const service = createVirtualTryOnService(repo);

        const result = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-1',
        });
        expect(result).toEqual({
          ok: false,
          code: 'RETRY_LIMIT_REACHED',
          job: expect.objectContaining({ id: 'job-1', attemptCount: 3 }),
        });
      });

      it('increments attemptCount and resets status to queued when retrying failed job (< 3)', async () => {
        const failedJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'failed',
          attemptCount: 1,
          tokenRecoveryStatus: 'retryable',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-old',
          },
          resultPath: 'stale/path',
          provider: 'fashn',
          providerReference: 'fashn-old',
          error: 'Old error',
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([failedJob]);
        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:05:00.000Z'),
        });

        const result = await service.createOrRetryJob({
          tokenId: 'token-1',
          analysisId: 'analysis-1',
          productId: 'prod-1',
          photoPath: 'full-body/photo-new',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.job).toMatchObject({
            id: 'job-1',
            attemptCount: 2,
            status: 'queued',
            resultPath: null,
            error: null,
            tokenRecoveryStatus: 'not_needed',
            input: {
              analysis_id: 'analysis-1',
              product_id: 'prod-1',
              photo_path: 'full-body/photo-new',
            },
            updatedAt: '2026-10-25T16:05:00.000Z',
          });
        }
      });
    });

    describe('syncJobStatus', () => {
      it('returns terminal jobs immediately without polling or consuming token', async () => {
        const completedJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'completed',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: 'vto/result-1',
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([completedJob]);
        const checkTryOnStatus = vi.fn();
        const consumeToken = vi.fn();
        const service = createVirtualTryOnService(repo, {
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus,
          },
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced).toEqual(completedJob);
        expect(checkTryOnStatus).not.toHaveBeenCalled();
        expect(consumeToken).not.toHaveBeenCalled();
      });

      it('enforces 90s timeout transitioning stuck processing job to failed and sets tokenRecoveryStatus retryable (attempts 1-2)', async () => {
        const stuckJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, usageEvents } = createTestRepo([stuckJob]);
        const checkTryOnStatus = vi.fn();
        const consumeToken = vi.fn();
        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:01:31.000Z'), // 91s later (>90s)
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus,
          },
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('failed');
        expect(synced?.error).toContain('timed out after 90 seconds');
        expect(synced?.tokenRecoveryStatus).toBe('retryable');
        expect(checkTryOnStatus).not.toHaveBeenCalled();
        expect(consumeToken).not.toHaveBeenCalled();
        expect(usageEvents).toHaveLength(1);
        expect(usageEvents[0]).toMatchObject({
          jobId: 'job-1',
          provider: 'fashn',
          status: 'failed',
          errorCode: 'timeout',
          estimatedCostIdr: 0,
        });
      });

      it('enforces 90s timeout with attemptCount 3 sets tokenRecoveryStatus manual_recovery_required', async () => {
        const stuckJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 3,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([stuckJob]);
        const consumeToken = vi.fn();
        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:01:31.000Z'),
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('failed');
        expect(synced?.tokenRecoveryStatus).toBe('manual_recovery_required');
        expect(consumeToken).not.toHaveBeenCalled();
      });

      it('on provider completed: validates photo, stores in private storage, updates DB, records usage, and calls consumeToken', async () => {
        const jpegBytes = await createValidJpeg();
        const jpegBase64 = Buffer.from(jpegBytes).toString('base64');

        const processingJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-pred-123',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, usageEvents } = createTestRepo([processingJob]);
        const checkTryOnStatus = vi.fn().mockResolvedValue({
          status: 'completed' as const,
          outputDataUri: `data:image/jpeg;base64,${jpegBase64}`,
          creditsUsed: 1,
          estimatedCostIdr: FASHN_CREDIT_COST_IDR,
          model: 'tryon-v1.6',
        });
        const photoStorage = {
          store: vi.fn().mockResolvedValue({
            id: 'asset-vto-1',
            objectPath: 'vto/asset-vto-1',
          }),
        };
        const consumeToken = vi.fn().mockResolvedValue({ id: 'token-1', status: 'consumed' });

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:00:15.000Z'), // 15s later (<90s)
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus,
          },
          photoStorage: photoStorage as unknown as NonNullable<
            Parameters<typeof createVirtualTryOnService>[1]
          >['photoStorage'],
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('completed');
        expect(synced?.resultPath).toBe('vto/asset-vto-1');
        expect(synced?.tokenRecoveryStatus).toBe('not_needed');
        expect(photoStorage.store).toHaveBeenCalledWith(
          expect.objectContaining({ ok: true, mimeType: 'image/jpeg' }),
          'vtoResult',
        );
        expect(consumeToken).toHaveBeenCalledWith('token-1');
        expect(usageEvents).toHaveLength(1);
        expect(usageEvents[0]).toMatchObject({
          jobId: 'job-1',
          provider: 'fashn',
          feature: 'virtual_try_on',
          status: 'completed',
          estimatedCostIdr: FASHN_CREDIT_COST_IDR,
        });
      });

      it('on provider failure: marks failed, sets tokenRecoveryStatus retryable on attempt 1, leaves token reserved', async () => {
        const processingJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-pred-123',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, usageEvents } = createTestRepo([processingJob]);
        const checkTryOnStatus = vi.fn().mockResolvedValue({
          status: 'failed' as const,
          errorCode: 'pose_error' as const,
          errorMessage: 'Model pose could not be detected',
          model: 'tryon-v1.6',
        });
        const consumeToken = vi.fn();

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:00:15.000Z'),
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus,
          },
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('failed');
        expect(synced?.error).toBe('Model pose could not be detected');
        expect(synced?.tokenRecoveryStatus).toBe('retryable');
        expect(consumeToken).not.toHaveBeenCalled();
        expect(usageEvents).toHaveLength(1);
        expect(usageEvents[0]).toMatchObject({
          jobId: 'job-1',
          provider: 'fashn',
          feature: 'virtual_try_on',
          status: 'failed',
          errorCode: 'pose_error',
          estimatedCostIdr: 0,
        });
      });

      it('on provider failure: marks failed, sets tokenRecoveryStatus manual_recovery_required on attempt 3', async () => {
        const processingJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 3,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-pred-123',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo } = createTestRepo([processingJob]);
        const checkTryOnStatus = vi.fn().mockResolvedValue({
          status: 'failed' as const,
          errorCode: 'pose_error' as const,
          errorMessage: 'Model pose could not be detected',
          model: 'tryon-v1.6',
        });
        const consumeToken = vi.fn();

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:00:15.000Z'),
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus,
          },
          consumeToken,
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('failed');
        expect(synced?.tokenRecoveryStatus).toBe('manual_recovery_required');
        expect(consumeToken).not.toHaveBeenCalled();
      });

      it('on timeout race: reloads and returns current job when updateIfStatus returns null', async () => {
        const stuckJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-1',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, jobs, usageEvents } = createTestRepo([stuckJob]);
        // Simulate race: another worker completed the job
        vi.mocked(repo.updateIfStatus!).mockImplementationOnce(async (id) => {
          jobs.set(id, {
            ...jobs.get(id)!,
            status: 'completed',
            resultPath: 'vto/winner.jpg',
          });
          return null;
        });

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:01:31.000Z'), // >90s
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('completed');
        expect(synced?.resultPath).toBe('vto/winner.jpg');
        expect(usageEvents).toHaveLength(0);
      });

      it('on provider failure race: reloads and returns current job when updateIfStatus returns null', async () => {
        const processingJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-pred-123',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, jobs, usageEvents } = createTestRepo([processingJob]);
        vi.mocked(repo.updateIfStatus!).mockImplementationOnce(async (id) => {
          jobs.set(id, {
            ...jobs.get(id)!,
            status: 'completed',
            resultPath: 'vto/winner.jpg',
          });
          return null;
        });

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:00:15.000Z'),
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus: vi.fn().mockResolvedValue({
              status: 'failed' as const,
              errorCode: 'internal_error' as const,
              errorMessage: 'FASHN backend died',
            }),
          },
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('completed');
        expect(synced?.resultPath).toBe('vto/winner.jpg');
        expect(usageEvents).toHaveLength(0);
      });

      it('on photo validation failure race: reloads and returns current job when updateIfStatus returns null', async () => {
        const processingJob: VtoJobRecord = {
          id: 'job-1',
          tokenId: 'token-1',
          type: 'virtual_try_on',
          status: 'processing',
          attemptCount: 1,
          tokenRecoveryStatus: 'not_needed',
          input: {
            analysis_id: 'analysis-1',
            product_id: 'prod-1',
            photo_path: 'full-body/photo-1',
          },
          resultPath: null,
          provider: 'fashn',
          providerReference: 'fashn-pred-123',
          error: null,
          createdAt: '2026-10-25T16:00:00.000Z',
          updatedAt: '2026-10-25T16:00:00.000Z',
        };
        const { repo, jobs } = createTestRepo([processingJob]);
        vi.mocked(repo.updateIfStatus!).mockImplementationOnce(async (id) => {
          jobs.set(id, {
            ...jobs.get(id)!,
            status: 'completed',
            resultPath: 'vto/winner.jpg',
          });
          return null;
        });

        const service = createVirtualTryOnService(repo, {
          now: () => new Date('2026-10-25T16:00:15.000Z'),
          provider: {
            submitTryOn: vi.fn(),
            checkTryOnStatus: vi.fn().mockResolvedValue({
              status: 'completed' as const,
              outputDataUri: 'data:image/jpeg;base64,not-a-valid-jpeg-bytes',
            }),
          },
        });

        const synced = await service.syncJobStatus('job-1', 'token-1');
        expect(synced?.status).toBe('completed');
        expect(synced?.resultPath).toBe('vto/winner.jpg');
      });
    });
  });
});

