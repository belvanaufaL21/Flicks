// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardView } from '../../src/app/admin/admin-dashboard-view';
import { POST as postAdminCleanup } from '../../src/app/api/admin/system/cleanup-photos/route';
import { POST as postAdminRecoverToken } from '../../src/app/api/admin/tokens/[tokenId]/recover/route';
import {
  createInMemoryPhotoRepository,
  createInMemoryTokenRepository,
  resetLocalDevMemoryState,
} from '../../src/server/dev/local-memory-store';
import {
  createAnalysisService,
  createInMemoryAnalysisJobRepository,
} from '../../src/server/analysis/analysis.service';
import { submitFashnTryOn } from '../../src/server/providers/fashn';
import { PHOTO_RETENTION_MS } from '../../src/server/storage/private-photo-storage';
import { createTokenService } from '../../src/server/tokens/token.service';

const SAMPLE_SUMMARY = {
  transactions: { totalCount: 1, paidCount: 1, totalRevenueIdr: 19000 },
  tokens: {
    totalCount: 1,
    availableCount: 1,
    reservedCount: 0,
    consumedCount: 0,
    expiredCount: 0,
  },
  jobs: {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    successRatePercent: 100,
  },
  costs: {
    geminiEstimatedIdr: 0,
    fashnActualIdr: 0,
    totalCostIdr: 0,
    events: [],
  },
  financials: {
    grossRevenueIdr: 19000,
    midtransFeeIdr: 133,
    geminiCostIdr: 0,
    fashnCostIdr: 0,
    totalCogsIdr: 133,
    grossProfitIdr: 18867,
    grossMarginPercent: 99,
  },
};

describe('Task 1.5: 72h Photo Retention, Automated/Manual Cleanup & Token Recovery Policy', () => {
  beforeEach(() => {
    resetLocalDevMemoryState();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('enforces 72h retention constant, deletes expired photos via admin manual cleanup, and preserves non-expired photos', async () => {
    expect(PHOTO_RETENTION_MS).toBe(72 * 60 * 60 * 1000);

    // Unauthenticated call must fail with 401
    const unauthRes = await postAdminCleanup(
      new Request('http://localhost/api/admin/system/cleanup-photos', {
        method: 'POST',
      }),
    );
    expect(unauthRes.status).toBe(401);

    // Seed 2 expired photos (>72h) and 1 fresh photo (<72h)
    const photoRepo = createInMemoryPhotoRepository();
    const now = Date.now();
    const expiredIso = new Date(now - 60_000).toISOString();
    const freshIso = new Date(now + PHOTO_RETENTION_MS).toISOString();

    await photoRepo.upload('face/expired-1', new Uint8Array([1, 2]), 'image/jpeg');
    await photoRepo.createRecord({
      id: 'expired-1',
      kind: 'face',
      objectPath: 'face/expired-1',
      mimeType: 'image/jpeg',
      sizeBytes: 2,
      width: 800,
      height: 1200,
      createdAt: new Date(now - PHOTO_RETENTION_MS - 60_000).toISOString(),
      expiresAt: expiredIso,
    });

    await photoRepo.upload('full-body/expired-2', new Uint8Array([3, 4]), 'image/jpeg');
    await photoRepo.createRecord({
      id: 'expired-2',
      kind: 'fullBody',
      objectPath: 'full-body/expired-2',
      mimeType: 'image/jpeg',
      sizeBytes: 2,
      width: 800,
      height: 1200,
      createdAt: new Date(now - PHOTO_RETENTION_MS - 60_000).toISOString(),
      expiresAt: expiredIso,
    });

    await photoRepo.upload('face/fresh-1', new Uint8Array([5, 6]), 'image/jpeg');
    await photoRepo.createRecord({
      id: 'fresh-1',
      kind: 'face',
      objectPath: 'face/fresh-1',
      mimeType: 'image/jpeg',
      sizeBytes: 2,
      width: 800,
      height: 1200,
      createdAt: new Date(now).toISOString(),
      expiresAt: freshIso,
    });

    const res = await postAdminCleanup(
      new Request('http://localhost/api/admin/system/cleanup-photos', {
        method: 'POST',
        headers: { 'x-flicks-dev-admin': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deletedCount: 2, failedCount: 0 });

    expect(await photoRepo.downloadObject?.('face/expired-1')).toBeNull();
    expect(await photoRepo.downloadObject?.('full-body/expired-2')).toBeNull();
    expect(await photoRepo.downloadObject?.('face/fresh-1')).not.toBeNull();
  });

  it('configures automated Vercel Cron cleanup and zero-CDN FASHN retention (return_base64: true)', async () => {
    const vercelJsonRaw = readFileSync(
      join(process.cwd(), 'vercel.json'),
      'utf8',
    );
    const vercelConfig = JSON.parse(vercelJsonRaw) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    expect(vercelConfig.crons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/api/cron/cleanup-photos',
        }),
      ]),
    );

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'fashn-1', status: 'processing' }), {
        status: 200,
      }),
    );
    await submitFashnTryOn(
      {
        modelImageDataUri: 'data:image/jpeg;base64,AA==',
        garmentImage: 'https://example.com/top.jpg',
        category: 'tops',
      },
      { apiKey: 'test-key', fetchImpl: fetchSpy as unknown as typeof fetch },
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentPayload = JSON.parse(String(init.body));
    expect(sentPayload.return_base64).toBe(true);
    expect(sentPayload.inputs.return_base64).toBe(true);
  });

  it('allows failed analysis retry without losing token and supports manual admin token recovery', async () => {
    const tokenRepo = createInMemoryTokenRepository();
    const tokenService = createTokenService(tokenRepo);
    const [issued] = await tokenService.createDevTokens(1);

    // Reserve token and simulate failed analysis job
    const reserved = await tokenService.reserveToken(issued!.secret);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;

    const analysisRepo = createInMemoryAnalysisJobRepository();
    const failingProvider = {
      analyzePhoto: vi.fn().mockRejectedValueOnce(new Error('Gemini timeout')).mockResolvedValueOnce({
        status: 'completed' as const,
        result: {
          personal_color: {
            primary_season: 'winter' as const,
            sub_season: 'true winter',
            confidence_level: 'high' as const,
            recommended_colors: ['#000000'],
          },
          body_shape: {
            category: 'hourglass' as const,
            confidence_level: 'high' as const,
            styling_guidance: ['Fitted silhouettes'],
          },
        },
      }),
    };
    const analysisService = createAnalysisService(analysisRepo, {
      provider: failingProvider,
    });

    const firstCreate = await analysisService.createJob({
      tokenId: reserved.token.id,
      photoPath: 'face/p1',
      consent: true,
    });
    expect(firstCreate.ok).toBe(true);
    if (!firstCreate.ok) return;

    const failedJob = await analysisService.processJob(firstCreate.job.id);
    expect(failedJob.status).toBe('failed');

    // Operator or failed-job handler releases reserved token back to available
    const recoverRes = await postAdminRecoverToken(
      new Request(
        `http://localhost/api/admin/tokens/${reserved.token.id}/recover`,
        {
          method: 'POST',
          headers: { 'x-flicks-dev-admin': '1' },
        },
      ),
      { params: Promise.resolve({ tokenId: reserved.token.id }) },
    );
    expect(recoverRes.status).toBe(200);
    const recoverBody = await recoverRes.json();
    expect(recoverBody.ok).toBe(true);
    expect(recoverBody.token.status).toBe('available');

    // User retries analysis with the SAME token and succeeds!
    const retryReserve = await tokenService.reserveToken(issued!.secret);
    expect(retryReserve.ok).toBe(true);

    const retryCreate = await analysisService.createJob({
      tokenId: reserved.token.id,
      photoPath: 'face/p1',
      consent: true,
    });
    expect(retryCreate.ok).toBe(true);
    if (!retryCreate.ok) return;

    const completedJob = await analysisService.processJob(retryCreate.job.id);
    expect(completedJob.status).toBe('completed');
  });

  it('triggers manual expired photo cleanup from AdminDashboardView UI', async () => {
    const onCleanupExpiredPhotos = vi
      .fn()
      .mockResolvedValue({ deletedCount: 2, failedCount: 0 });

    render(
      <AdminDashboardView
        summary={SAMPLE_SUMMARY}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[]}
        onCleanupExpiredPhotos={onCleanupExpiredPhotos}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Cleanup Expired Photos/i }),
    );
    expect(onCleanupExpiredPhotos).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.getByText(/Cleaned 2 expired photo\(s\)/i)).toBeDefined();
    });
  });
});
