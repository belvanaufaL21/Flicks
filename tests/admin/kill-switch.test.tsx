// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardView } from '../../src/app/admin/admin-dashboard-view';
import {
  GET as getKillSwitch,
  POST as postKillSwitch,
} from '../../src/app/api/admin/system/kill-switch/route';
import {
  POST as postCleanupPhotos,
} from '../../src/app/api/admin/system/cleanup-photos/route';
import { POST as postAnalysis } from '../../src/app/api/analysis/route';
import { POST as postVto } from '../../src/app/api/virtual-try-on/route';
import {
  createInMemoryTokenRepository,
  resetLocalDevMemoryState,
} from '../../src/server/dev/local-memory-store';
import { createTokenService } from '../../src/server/tokens/token.service';
import { checkVtoQuota } from '../../src/server/vto/virtual-try-on.service';

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

describe('Operator Kill Switch & Paid Work Maintenance Pause', () => {
  beforeEach(() => {
    resetLocalDevMemoryState();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated requests to /api/admin/system/kill-switch with 401', async () => {
    const getRes = await getKillSwitch(
      new Request('http://localhost/api/admin/system/kill-switch'),
    );
    expect(getRes.status).toBe(401);

    const postRes = await postKillSwitch(
      new Request('http://localhost/api/admin/system/kill-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paidWorkPaused: true }),
      }),
    );
    expect(postRes.status).toBe(401);
  });

  it('pauses /api/analysis and /api/virtual-try-on with 503 without consuming token or VTO quota, then resumes cleanly', async () => {
    const tokenService = createTokenService(createInMemoryTokenRepository());
    const [issued] = await tokenService.createDevTokens(1);

    const pauseRes = await postKillSwitch(
      new Request('http://localhost/api/admin/system/kill-switch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-flicks-dev-admin': '1',
        },
        body: JSON.stringify({
          paidWorkPaused: true,
          reason: 'Spike investigation',
        }),
      }),
    );
    expect(pauseRes.status).toBe(200);
    const pauseJson = await pauseRes.json();
    expect(pauseJson.ok).toBe(true);
    expect(pauseJson.killSwitch.paidWorkPaused).toBe(true);

    const analysisBlocked = await postAnalysis(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issued!.secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: 'private/face/test.jpg',
          consent: true,
        }),
      }),
    );
    expect(analysisBlocked.status).toBe(503);
    const analysisBody = await analysisBlocked.json();
    expect(analysisBody.error).toBe('PAID_WORK_PAUSED');
    expect(analysisBody.code).toBe('paid_work_paused');

    const vtoBlocked = await postVto(
      new Request('http://localhost/api/virtual-try-on', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issued!.secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          top_product_id: 'prod-active-1',
          user_photo_uri: 'private/full_body/test.jpg',
        }),
      }),
    );
    expect(vtoBlocked.status).toBe(503);
    const vtoBody = await vtoBlocked.json();
    expect(vtoBody.error).toBe('PAID_WORK_PAUSED');
    expect(vtoBody.code).toBe('paid_work_paused');

    // Verify user's paid token is STILL 'available' (not reserved/consumed) and VTO quota untouched
    const verifyAfterBlock = await tokenService.verifyToken(issued!.secret);
    expect(verifyAfterBlock.ok).toBe(true);
    if (verifyAfterBlock.ok) {
      expect(verifyAfterBlock.token.status).toBe('available');
      const quota = checkVtoQuota(verifyAfterBlock.token.id);
      expect(quota.topUsed).toBe(false);
      expect(quota.bottomUsed).toBe(false);
    }

    // Resume via admin endpoint
    const resumeRes = await postKillSwitch(
      new Request('http://localhost/api/admin/system/kill-switch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-flicks-dev-admin': '1',
        },
        body: JSON.stringify({ paidWorkPaused: false }),
      }),
    );
    expect(resumeRes.status).toBe(200);
    const getRes = await getKillSwitch(
      new Request('http://localhost/api/admin/system/kill-switch', {
        headers: { 'x-flicks-dev-admin': '1' },
      }),
    );
    const getJson = await getRes.json();
    expect(getJson.killSwitch.paidWorkPaused).toBe(false);
  });

  it('renders kill-switch controls and maintenance status in AdminDashboardView', () => {
    const onToggleKillSwitch = vi.fn();
    const { rerender } = render(
      <AdminDashboardView
        summary={SAMPLE_SUMMARY}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[]}
        killSwitch={{
          paidWorkPaused: false,
          reason: null,
          updatedAt: '2026-11-07T00:00:00.000Z',
        }}
        onToggleKillSwitch={onToggleKillSwitch}
      />,
    );

    expect(screen.getByText(/AI Engine: Active/i)).toBeDefined();
    const pauseButton = screen.getByRole('button', {
      name: /Pause Paid AI Work/i,
    });
    fireEvent.click(pauseButton);

    // Confirm dialog appears
    expect(screen.getByText(/Jeda Operasional AI Berbayar\?/i)).toBeDefined();
    const confirmButton = screen.getByRole('button', {
      name: /Ya, Jeda AI Berbayar/i,
    });
    fireEvent.click(confirmButton);
    expect(onToggleKillSwitch).toHaveBeenCalledWith(
      true,
      expect.stringMatching(/Admin paused via dashboard|Jeda operasional AI/i),
    );

    rerender(
      <AdminDashboardView
        summary={SAMPLE_SUMMARY}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[]}
        killSwitch={{
          paidWorkPaused: true,
          reason: 'Cost spike',
          updatedAt: '2026-11-07T00:05:00.000Z',
        }}
        onToggleKillSwitch={onToggleKillSwitch}
      />,
    );

    expect(screen.getByText(/AI Engine: Paused/i)).toBeDefined();
    const resumeButton = screen.getByRole('button', {
      name: /Resume Paid AI Work/i,
    });
    fireEvent.click(resumeButton);
    expect(onToggleKillSwitch).toHaveBeenCalledWith(false);
  });

  it('protects POST /api/admin/system/cleanup-photos with admin session and supports local dev fallback', async () => {
    const unauthRes = await postCleanupPhotos(
      new Request('http://localhost/api/admin/system/cleanup-photos', {
        method: 'POST',
      }),
    );
    expect(unauthRes.status).toBe(401);

    const authRes = await postCleanupPhotos(
      new Request('http://localhost/api/admin/system/cleanup-photos', {
        method: 'POST',
        headers: { 'x-flicks-dev-admin': '1' },
      }),
    );
    expect(authRes.status).toBe(200);
    const json = await authRes.json();
    expect(json.ok).toBe(true);
    expect(typeof json.deletedCount).toBe('number');
  });
});
