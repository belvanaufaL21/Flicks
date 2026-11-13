import { describe, it, expect, vi } from 'vitest';
import {
  createVirtualTryOnService,
  type VtoRepository,
  type VtoJobRecord,
} from '../../src/server/vto/virtual-try-on.service';

describe('VTO Idempotency & Concurrency Locking (Zero Redundant Credit Burn)', () => {
  function createMockRepo() {
    const jobs = new Map<string, VtoJobRecord>();

    const repo: VtoRepository = {
      findProductById: vi.fn(),
      findAnalysisById: vi.fn(),
      findByTokenId: vi.fn().mockImplementation(async (tokenId: string) => {
        for (const job of jobs.values()) {
          if (job.tokenId === tokenId) return job;
        }
        return null;
      }),
      findById: vi.fn().mockImplementation(async (id: string) => jobs.get(id) ?? null),
      create: vi.fn().mockImplementation(async (job: VtoJobRecord) => {
        jobs.set(job.id, job);
        return job;
      }),
      update: vi.fn().mockImplementation(async (id: string, patch: Partial<VtoJobRecord>) => {
        const existing = jobs.get(id);
        if (!existing) throw new Error('NOT_FOUND');
        const updated = { ...existing, ...patch };
        jobs.set(id, updated);
        return updated;
      }),
      recordUsageEvent: vi.fn(),
    };

    return { repo, jobs };
  }

  it('exposes getJobByTokenId to find existing token jobs', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    jobs.set('job-1', {
      id: 'job-1',
      tokenId: 'token-lock-test',
      type: 'virtual_try_on',
      status: 'completed',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: { personImagePath: 'img', garmentImagePath: 'g' },
      resultPath: 'https://fashn.cdn/cached-result.png',
      provider: 'fashn',
      providerReference: 'pred-1',
      error: null,
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T01:00:15Z',
    });

    const job = await service.getJobByTokenId('token-lock-test');
    expect(job).not.toBeNull();
    expect(job?.status).toBe('completed');
    expect(job?.resultPath).toBe('https://fashn.cdn/cached-result.png');
  });

  it('returns cached completed result without calling FASHN provider when job is already completed', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    jobs.set('job-completed', {
      id: 'job-completed',
      tokenId: 'token-already-done',
      type: 'virtual_try_on',
      status: 'completed',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: { personImagePath: 'img', garmentImagePath: 'g' },
      resultPath: 'https://fashn.cdn/persisted-result.png',
      provider: 'fashn',
      providerReference: 'pred-done-1',
      error: null,
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T01:00:15Z',
    });

    const guardResult = await service.checkExecutionGuard('token-already-done');
    expect(guardResult.status).toBe('completed');
    expect(guardResult.cachedResultUri).toBe('https://fashn.cdn/persisted-result.png');
    expect(guardResult.canProceed).toBe(false);
  });

  it('blocks concurrent execution when a job is already in processing state', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    jobs.set('job-running', {
      id: 'job-running',
      tokenId: 'token-in-flight',
      type: 'virtual_try_on',
      status: 'processing',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: { personImagePath: 'img', garmentImagePath: 'g' },
      resultPath: null,
      provider: 'fashn',
      providerReference: 'pred-flight-1',
      error: null,
      createdAt: '2026-11-13T01:10:00Z',
      updatedAt: '2026-11-13T01:10:05Z',
    });

    const guardResult = await service.checkExecutionGuard('token-in-flight');
    expect(guardResult.status).toBe('processing');
    expect(guardResult.canProceed).toBe(false);
  });

  it('allows execution when token has no prior completed or running job', async () => {
    const { repo } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    const guardResult = await service.checkExecutionGuard('token-brand-new');
    expect(guardResult.status).toBe('idle');
    expect(guardResult.canProceed).toBe(true);
  });

  it('allows trying 1 setelan (both top and bottom) on a new token', async () => {
    const { repo } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    const guardResult = await service.checkExecutionGuard('token-brand-new-setelan', {
      topProductId: 'top-1',
      bottomProductId: 'bot-1',
    });
    expect(guardResult.status).toBe('idle');
    expect(guardResult.canProceed).toBe(true);
    expect(guardResult.quotaStatus?.canTryTop).toBe(true);
    expect(guardResult.quotaStatus?.canTryBottom).toBe(true);
  });

  it('blocks repeat atasan execution when atasan was already completed, but allows bawahan', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    jobs.set('job-top-only', {
      id: 'job-top-only',
      tokenId: 'token-top-done',
      type: 'virtual_try_on',
      status: 'completed',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: {
        analysis_id: '',
        product_id: 'top-1',
        top_product_id: 'top-1',
        bottom_product_id: null,
        top_used: true,
        bottom_used: false,
        photo_path: 'user.jpg',
      },
      resultPath: 'https://fashn.cdn/top-result.png',
      provider: 'fashn',
      providerReference: 'pred-top-1',
      error: null,
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T01:00:15Z',
    });

    // Attempting another atasan must be blocked (quota exhausted for atasan)
    const topGuard = await service.checkExecutionGuard('token-top-done', {
      topProductId: 'top-2',
    });
    expect(topGuard.canProceed).toBe(false);
    expect(topGuard.status).toBe('quota_exhausted');
    expect(topGuard.message).toContain('atasan sudah terpakai');

    // Attempting bawahan must be ALLOWED
    const bottomGuard = await service.checkExecutionGuard('token-top-done', {
      bottomProductId: 'bot-1',
    });
    expect(bottomGuard.canProceed).toBe(true);
  });

  it('blocks repeat bawahan execution when bawahan was already completed, but allows atasan', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    jobs.set('job-bot-only', {
      id: 'job-bot-only',
      tokenId: 'token-bot-done',
      type: 'virtual_try_on',
      status: 'completed',
      attemptCount: 1,
      tokenRecoveryStatus: 'not_needed',
      input: {
        analysis_id: '',
        product_id: 'bot-1',
        top_product_id: null,
        bottom_product_id: 'bot-1',
        top_used: false,
        bottom_used: true,
        photo_path: 'user.jpg',
      },
      resultPath: 'https://fashn.cdn/bot-result.png',
      provider: 'fashn',
      providerReference: 'pred-bot-1',
      error: null,
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T01:00:15Z',
    });

    // Attempting another bawahan must be blocked (quota exhausted for bawahan)
    const botGuard = await service.checkExecutionGuard('token-bot-done', {
      bottomProductId: 'bot-2',
    });
    expect(botGuard.canProceed).toBe(false);
    expect(botGuard.status).toBe('quota_exhausted');
    expect(botGuard.message).toContain('bawahan sudah terpakai');

    // Attempting atasan must be ALLOWED
    const topGuard = await service.checkExecutionGuard('token-bot-done', {
      topProductId: 'top-1',
    });
    expect(topGuard.canProceed).toBe(true);
  });

  it('merges sequential executions in recordPipelineExecution preserving both top and bottom', async () => {
    const { repo, jobs } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    // 1. Run top first
    await service.recordPipelineExecution({
      tokenId: 'token-seq-test',
      topProductId: 'top-seq-1',
      bottomProductId: null,
      userPhotoUri: 'user-orig.jpg',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/step1-top.png',
        quotaDeduction: { top: true, bottom: false },
        totalCostUsd: 0.075,
        totalDurationMs: 12000,
      },
    });

    const jobAfterTop = await service.getJobByTokenId('token-seq-test');
    expect(jobAfterTop).not.toBeNull();
    const input1 = jobAfterTop?.input as any;
    expect(input1.top_product_id).toBe('top-seq-1');
    expect(input1.top_used).toBe(true);
    expect(input1.bottom_used).toBe(false);

    // 2. Run bottom sequentially
    await service.recordPipelineExecution({
      tokenId: 'token-seq-test',
      topProductId: null,
      bottomProductId: 'bot-seq-1',
      userPhotoUri: 'https://fashn.cdn/step1-top.png',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/step2-both.png',
        quotaDeduction: { top: false, bottom: true },
        totalCostUsd: 0.075,
        totalDurationMs: 12000,
      },
    });

    const jobAfterBoth = await service.getJobByTokenId('token-seq-test');
    const input2 = jobAfterBoth?.input as any;
    expect(input2.top_product_id).toBe('top-seq-1');
    expect(input2.bottom_product_id).toBe('bot-seq-1');
    expect(input2.top_used).toBe(true);
    expect(input2.bottom_used).toBe(true);
  });
});
