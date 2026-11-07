import { describe, expect, it, vi } from 'vitest';
import {
  createReportService,
  REPORT_VALIDITY_HOURS,
  type ReportRecord,
  type ReportRepository,
  type ReportSourceJobsRepository,
} from '../../src/server/reports/report.service';

describe('ReportService (Tasks 1.1, 1.2)', () => {
  const mockNow = new Date('2026-11-04T12:00:00.000Z');

  it('generates a 24-byte hex secret and stores SHA-256 hash with 72h expiry', async () => {
    expect(REPORT_VALIDITY_HOURS).toBe(72);
    const reports = new Map<string, ReportRecord>();
    const repo: ReportRepository = {
      create: vi.fn().mockImplementation(async (r) => {
        reports.set(r.secretHash, r);
        return r;
      }),
      findBySecretHash: vi.fn().mockImplementation(async (h) => reports.get(h) ?? null),
      findByTokenId: vi.fn().mockImplementation(async (tid) => {
        for (const r of reports.values()) if (r.tokenId === tid) return r;
        return null;
      }),
    };

    const jobsRepo: ReportSourceJobsRepository = {
      findAnalysisByTokenId: vi.fn().mockResolvedValue({
        id: 'analysis-1',
        tokenId: 'token-1',
        status: 'completed',
        input: { photo_path: 'face/photo-1.jpg', full_body_photo_path: 'body/photo-1.jpg' },
        result: {
          personalColor: {
            primarySeason: 'Warm Autumn',
            subSeason: 'Deep Autumn',
            alternativeCandidates: ['Warm Spring'],
            confidenceLevel: 'high',
            paletteRecommendations: {
              clothing: ['#8B4513', '#D2691E'],
              avoid: ['#00FFFF'],
            },
            photoQuality: { lighting: 'good', imageClarity: 'clear' },
            disclaimer: 'Analisis warna berbasis AI.',
          },
          bodyShape: {
            category: 'Hourglass',
            alternativeCandidates: ['Rectangle'],
            confidenceLevel: 'high',
            stylingTips: ['Highlight waistline'],
            disclaimer: 'Analisis bentuk tubuh berbasis AI.',
          },
        },
      }),
      findVtoByTokenId: vi.fn().mockResolvedValue({
        id: 'vto-1',
        tokenId: 'token-1',
        status: 'completed',
        resultPath: 'vto/result-1.jpg',
        input: { product_id: 'prod-1', photo_path: 'face/photo-1.jpg' },
      }),
      findProductById: vi.fn().mockResolvedValue({
        id: 'prod-1',
        name: 'Classic Linen Blazer',
        category: 'outerwear',
      }),
    };

    const service = createReportService({
      reportRepo: repo,
      jobsRepo,
      now: () => mockNow,
    });

    const result = await service.createOrGetReport('token-1');
    expect(result.secret).toHaveLength(48); // 24 bytes hex = 48 chars
    expect(result.expiresAt).toBe('2026-11-07T12:00:00.000Z'); // exactly 72h later
    expect(repo.create).toHaveBeenCalledOnce();

    // Idempotent call returns same secret
    const secondCall = await service.createOrGetReport('token-1');
    expect(secondCall.secret).toBe(result.secret);

    // Retrieve assembled report by secret
    const activeReport = await service.getReportBySecret(result.secret);
    expect(activeReport.status).toBe('active');
    expect(activeReport.payload?.personalColor.primarySeason).toBe('Warm Autumn');
    expect(activeReport.payload?.bodyShape.category).toBe('Hourglass');
    expect(activeReport.payload?.virtualTryOn?.product.name).toBe('Classic Linen Blazer');
    expect(activeReport.payload?.virtualTryOn?.resultAssetUrl).toBe(
      `/api/report/${result.secret}/asset/vto_result`,
    );
    expect(activeReport.payload?.remainingSeconds).toBe(72 * 3600);
  });

  it('strictly enforces 72-hour expiry and returns expired status without payload leak', async () => {
    const expiredReport = {
      id: 'rep-expired',
      tokenId: 'tok-exp',
      secretHash: 'hash-expired',
      createdAt: '2026-11-01T10:00:00.000Z',
      expiresAt: '2026-11-04T10:00:00.000Z', // Expired 2 hours ago
    };

    const repo: ReportRepository = {
      create: vi.fn(),
      findBySecretHash: vi.fn().mockResolvedValue(expiredReport),
      findByTokenId: vi.fn(),
    };

    const service = createReportService({
      reportRepo: repo,
      jobsRepo: {
        findAnalysisByTokenId: vi.fn(),
        findVtoByTokenId: vi.fn(),
        findProductById: vi.fn(),
      },
      now: () => mockNow, // 2026-11-04T12:00:00.000Z
    });

    const report = await service.getReportBySecret('some-raw-secret');
    expect(report.status).toBe('expired');
    expect(report.payload).toBeNull();

    const assetCheck = await service.getAssetPathForReport('some-raw-secret', 'vto_result');
    expect(assetCheck.status).toBe('expired');
    expect(assetCheck.objectPath).toBeNull();
  });

  it('preserves non-conclusive / needs_review analysis status without fabricating results', async () => {
    const reports = new Map<string, ReportRecord>();
    const repo: ReportRepository = {
      create: vi.fn().mockImplementation(async (r) => {
        reports.set(r.secretHash, r);
        return r;
      }),
      findBySecretHash: vi.fn().mockImplementation(async (h) => reports.get(h) ?? null),
      findByTokenId: vi.fn().mockResolvedValue(null),
    };

    const jobsRepo: ReportSourceJobsRepository = {
      findAnalysisByTokenId: vi.fn().mockResolvedValue({
        id: 'analysis-inconclusive',
        tokenId: 'token-2',
        status: 'needs_review',
        input: { photo_path: 'face/blurry.jpg' },
        result: {
          personalColor: {
            status: 'needs_review',
            primarySeason: null,
            confidenceLevel: 'low',
            uncertaintyNotes: 'Pencahayaan terlalu redup untuk menentukan undertone pasti.',
            photoQuality: { lighting: 'poor', imageClarity: 'blurry' },
            disclaimer: 'Foto membutuhkan peninjauan ulang.',
          },
          bodyShape: {
            status: 'needs_review',
            category: null,
            confidenceLevel: 'low',
            uncertaintyNotes: 'Siluet tubuh tertutup pakaian longgar.',
            stylingTips: [],
            disclaimer: 'Foto membutuhkan peninjauan ulang.',
          },
        },
      }),
      findVtoByTokenId: vi.fn().mockResolvedValue(null),
      findProductById: vi.fn().mockResolvedValue(null),
    };

    const service = createReportService({
      reportRepo: repo,
      jobsRepo,
      now: () => mockNow,
    });

    const created = await service.createOrGetReport('token-2');
    const fetched = await service.getReportBySecret(created.secret);

    expect(fetched.status).toBe('active');
    expect(fetched.payload?.personalColor.status).toBe('needs_review');
    expect(fetched.payload?.personalColor.primarySeason).toBeNull();
    expect(fetched.payload?.personalColor.uncertaintyNotes).toContain('Pencahayaan terlalu redup');
  });
});
