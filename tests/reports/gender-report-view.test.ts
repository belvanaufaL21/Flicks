// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BODY_SHAPE_LABELS,
  type BodyShapeCategory,
} from '../../src/shared/body-shape-labels';
import {
  createReportService,
  type ReportRecord,
  type ReportRepository,
  type ReportSourceJobsRepository,
} from '../../src/server/reports/report.service';
import {
  ReportView,
  type CustomerReportViewData,
} from '../../src/app/result/[secret]/report-view';

describe('Report Service & View Gender-Differentiated Bilingual Display', () => {
  afterEach(() => {
    cleanup();
  });

  it('formats male and female categories bilingually via BODY_SHAPE_LABELS', () => {
    const maleCategory: BodyShapeCategory = 'trapezoid';
    expect(BODY_SHAPE_LABELS[maleCategory].display).toBe(
      'Trapezoid (Trapesium)',
    );

    const femaleCategory: BodyShapeCategory = 'hourglass';
    expect(BODY_SHAPE_LABELS[femaleCategory].display).toBe(
      'Hourglass (Jam Pasir)',
    );
  });

  it('includes gender from analysis job input in CustomerReportPayload.bodyShape', async () => {
    const reports = new Map<string, ReportRecord>();
    const reportRepo: ReportRepository = {
      create: vi.fn().mockImplementation(async (r) => {
        reports.set(r.secretHash, r);
        return r;
      }),
      findBySecretHash: vi
        .fn()
        .mockImplementation(async (h) => reports.get(h) ?? null),
      findByTokenId: vi.fn().mockResolvedValue(null),
    };

    const jobsRepo: ReportSourceJobsRepository = {
      findAnalysisByTokenId: vi.fn().mockResolvedValue({
        id: 'analysis-male-1',
        tokenId: 'token-male-1',
        status: 'completed',
        input: {
          photo_path: 'face/m1.jpg',
          full_body_photo_path: 'body/m1.jpg',
          gender: 'male',
        },
        result: {
          personalColor: {
            primarySeason: 'Deep Winter',
            confidenceLevel: 'high',
            paletteRecommendations: { clothing: ['#111827'], avoid: [] },
            disclaimer: 'AI disclaimer',
          },
          bodyShape: {
            category: 'trapezoid',
            confidenceLevel: 'high',
            stylingTips: ['Gunakan kemeja fitted'],
            disclaimer: 'AI disclaimer',
          },
        },
      }),
      findVtoByTokenId: vi.fn().mockResolvedValue(null),
      findProductById: vi.fn().mockResolvedValue(null),
    };

    const service = createReportService({ reportRepo, jobsRepo });
    const created = await service.createOrGetReport('token-male-1');
    const outcome = await service.getReportBySecret(created.secret);

    expect(outcome.status).toBe('active');
    expect(outcome.payload?.bodyShape.gender).toBe('male');
    expect(outcome.payload?.bodyShape.category).toBe('trapezoid');
  });

  it('renders bilingual body shape label and gender profile badge in ReportView', () => {
    const payload: CustomerReportViewData = {
      isExpired: false,
      remainingSeconds: 120000,
      personalColor: {
        primarySeason: 'Deep Winter',
        confidenceLevel: 'high',
        paletteRecommendations: { clothing: ['#111827'] },
        disclaimer: 'AI disclaimer',
      },
      bodyShape: {
        category: 'trapezoid',
        gender: 'male',
        confidenceLevel: 'high',
        stylingTips: ['Gunakan blazer berstruktur'],
        disclaimer: 'AI disclaimer',
      },
      virtualTryOn: null,
      metadata: { disclaimer: 'Catatan AI' },
    };

    render(
      React.createElement(ReportView, {
        initialReport: payload,
        secret: 'sec-1',
      }),
    );

    expect(screen.getByText('Trapezoid (Trapesium)')).toBeTruthy();
    expect(screen.getByText(/Profil:\s*Pria/i)).toBeTruthy();
  });
});
