// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReportView,
  type CustomerReportViewData,
} from '../../src/app/result/[secret]/report-view';

describe('ReportPage UI (/result/[secret])', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders expired notice when report is 410 or expired', () => {
    const expiredPayload = {
      isExpired: true,
      remainingSeconds: 0,
    };
    render(
      <ReportView
        initialReport={expiredPayload as unknown as CustomerReportViewData}
        secret="test-secret"
      />,
    );
    expect(screen.getByText(/Laporan Telah Kedaluwarsa/i)).toBeTruthy();
    expect(
      screen.getByText(/Masa aktif 72 jam laporan ini telah berakhir/i),
    ).toBeTruthy();
  });

  it('renders personal color, body shape, and VTO result when active', () => {
    const activePayload = {
      isExpired: false,
      remainingSeconds: 150000,
      personalColor: {
        primarySeason: 'Warm Autumn',
        confidenceLevel: 'high',
        paletteRecommendations: { clothing: ['#8B4513'] },
        disclaimer: 'Analisis berbasis AI.',
      },
      bodyShape: {
        category: 'Hourglass',
        confidenceLevel: 'high',
        stylingTips: ['Highlight waist'],
        disclaimer: 'Analisis berbasis AI.',
      },
      virtualTryOn: {
        product: { name: 'Linen Shirt', category: 'tops' },
        resultAssetUrl: '/api/report/test-secret/asset/vto_result',
      },
      metadata: { disclaimer: 'Hasil AI adalah panduan kurasi gaya.' },
    };

    render(
      <ReportView
        initialReport={activePayload as unknown as CustomerReportViewData}
        secret="test-secret"
      />,
    );
    expect(screen.getByText(/Warm Autumn/i)).toBeTruthy();
    expect(screen.getByText(/Hourglass/i)).toBeTruthy();
    expect(screen.getByText(/Linen Shirt/i)).toBeTruthy();
    expect(
      screen.getByText(/Hasil AI adalah panduan kurasi gaya/i),
    ).toBeTruthy();
  });

  it('triggers window.print when Simpan PDF button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const activePayload = {
      isExpired: false,
      remainingSeconds: 150000,
      personalColor: {
        primarySeason: 'Warm Autumn',
        confidenceLevel: 'high',
        paletteRecommendations: { clothing: ['#8B4513'] },
        disclaimer: '',
      },
      bodyShape: {
        category: 'Hourglass',
        confidenceLevel: 'high',
        stylingTips: ['Fit'],
        disclaimer: '',
      },
      virtualTryOn: {
        product: { name: 'Linen Shirt' },
        resultAssetUrl: '/api/report/test-secret/asset/vto_result',
      },
      metadata: { disclaimer: 'AI disclaimer' },
    };

    render(
      <ReportView
        initialReport={activePayload as unknown as CustomerReportViewData}
        secret="test-secret"
      />,
    );
    const downloadPdfButton = screen.getByRole('button', {
      name: /Simpan PDF|Download PDF/i,
    });
    expect(downloadPdfButton).toBeTruthy();

    fireEvent.click(downloadPdfButton);
    expect(printSpy).toHaveBeenCalledOnce();
  });
});
