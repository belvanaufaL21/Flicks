import { describe, it, expect, vi } from 'vitest';
import {
  createVirtualTryOnService,
  type VtoRepository,
  type VtoJobRecord,
  type VtoUsageEvent,
} from '../../src/server/vto/virtual-try-on.service';
import { FASHN_CREDIT_COST_IDR } from '../../src/server/providers/fashn';

describe('VTO Pipeline Job & Usage Recording (Admin Dashboard visibility)', () => {
  function createMockRepo() {
    const jobs = new Map<string, VtoJobRecord>();
    const usageEvents: VtoUsageEvent[] = [];

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
      recordUsageEvent: vi.fn().mockImplementation(async (ev: VtoUsageEvent) => {
        usageEvents.push(ev);
      }),
    };

    return { repo, jobs, usageEvents };
  }

  it('records a completed job and usage event when 1 garment try-on succeeds', async () => {
    const { repo, jobs, usageEvents } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    const result = await service.recordPipelineExecution({
      tokenId: 'token-abc-123',
      topProductId: null,
      bottomProductId: 'prod-bottom-1',
      userPhotoUri: 'data:image/jpeg;base64,mockdata',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/output.png',
        quotaDeduction: { top: false, bottom: true },
        totalCostUsd: 0.075,
        totalDurationMs: 4000,
      },
    });

    expect(result.jobId).toBeDefined();
    expect(jobs.size).toBe(1);

    const job = jobs.get(result.jobId)!;
    expect(job.tokenId).toBe('token-abc-123');
    expect(job.type).toBe('virtual_try_on');
    expect(job.status).toBe('completed');
    expect(job.provider).toBe('fashn');
    expect(job.resultPath).toBe('https://fashn.cdn/output.png');

    expect(usageEvents.length).toBe(1);
    expect(usageEvents[0].jobId).toBe(result.jobId);
    expect(usageEvents[0].provider).toBe('fashn');
    expect(usageEvents[0].feature).toBe('virtual_try_on');
    expect(usageEvents[0].model).toBe('tryon-v1.6 (bawahan)');
    expect(usageEvents[0].estimatedCostIdr).toBe(FASHN_CREDIT_COST_IDR);
    expect(usageEvents[0].status).toBe('completed');
  });

  it('records 2 distinct usage events (atasan & bawahan, 1 credit each) when both succeed', async () => {
    const { repo, usageEvents } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    await service.recordPipelineExecution({
      tokenId: 'token-abc-dual',
      topProductId: 'prod-top-1',
      bottomProductId: 'prod-bottom-1',
      userPhotoUri: 'data:image/jpeg;base64,mockdata',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/outfit.png',
        step1ImageUri: 'https://fashn.cdn/step1.png',
        quotaDeduction: { top: true, bottom: true },
        totalCostUsd: 0.15,
        totalDurationMs: 8000,
      },
    });

    expect(usageEvents.length).toBe(2);
    expect(usageEvents[0].model).toBe('tryon-v1.6 (atasan)');
    expect(usageEvents[0].estimatedCostIdr).toBe(FASHN_CREDIT_COST_IDR);
    expect(usageEvents[0].status).toBe('completed');

    expect(usageEvents[1].model).toBe('tryon-v1.6 (bawahan)');
    expect(usageEvents[1].estimatedCostIdr).toBe(FASHN_CREDIT_COST_IDR);
    expect(usageEvents[1].status).toBe('completed');

    const totalCost = usageEvents.reduce((sum, e) => sum + e.estimatedCostIdr, 0);
    expect(totalCost).toBe(2 * FASHN_CREDIT_COST_IDR);
  });

  it('updates existing job when user executes a second try-on on the same token', async () => {
    const { repo, jobs, usageEvents } = createMockRepo();
    const service = createVirtualTryOnService(repo);

    // Run 1: top
    const run1 = await service.recordPipelineExecution({
      tokenId: 'token-same',
      topProductId: 'prod-top-1',
      bottomProductId: null,
      userPhotoUri: 'data:image/jpeg;base64,mockdata',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/top.png',
        quotaDeduction: { top: true, bottom: false },
        totalCostUsd: 0.075,
        totalDurationMs: 4000,
      },
    });

    expect(jobs.size).toBe(1);

    // Run 2: bottom on same token
    const run2 = await service.recordPipelineExecution({
      tokenId: 'token-same',
      topProductId: null,
      bottomProductId: 'prod-bottom-1',
      userPhotoUri: 'data:image/jpeg;base64,mockdata',
      pipelineResult: {
        status: 'succeeded',
        finalImageUri: 'https://fashn.cdn/bottom.png',
        quotaDeduction: { top: false, bottom: true },
        totalCostUsd: 0.075,
        totalDurationMs: 4000,
      },
    });

    // Should NOT create a duplicate job row (violating unique constraint), but update existing
    expect(jobs.size).toBe(1);
    expect(run2.jobId).toBe(run1.jobId);
    expect(jobs.get(run1.jobId)!.attemptCount).toBe(2);

    // But should record a second usage event for the second credit
    expect(usageEvents.length).toBe(2);
    expect(usageEvents[0].model).toBe('tryon-v1.6 (atasan)');
    expect(usageEvents[1].model).toBe('tryon-v1.6 (bawahan)');
  });
});
