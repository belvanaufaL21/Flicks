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
});
