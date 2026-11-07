// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminDashboardView,
  type AdminDashboardViewProps,
} from '../../src/app/admin/admin-dashboard-view';

const baseProps: AdminDashboardViewProps = {
  summary: {
    transactions: { totalCount: 2, paidCount: 2, totalRevenueIdr: 38000 },
    tokens: {
      totalCount: 2,
      availableCount: 0,
      reservedCount: 0,
      consumedCount: 2,
      expiredCount: 0,
    },
    jobs: {
      totalCount: 4,
      completedCount: 4,
      failedCount: 0,
      successRatePercent: 100,
    },
    costs: {
      geminiEstimatedIdr: 1000,
      fashnActualIdr: 2700,
      totalCostIdr: 3700,
      events: [
        {
          id: 'ev-1',
          jobId: 'job-1',
          provider: 'gemini',
          feature: 'personal_color',
          model: 'gemini-2.5-flash',
          costType: 'estimated',
          amountIdr: 1000,
          inputTokens: 1000,
          outputTokens: 200,
          status: 'completed',
          errorCode: null,
          createdAt: '2026-11-06T10:00:00.000Z',
        },
        {
          id: 'ev-2',
          jobId: 'job-2',
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: 'tryon-v1.6',
          costType: 'actual',
          amountIdr: 2700,
          inputTokens: null,
          outputTokens: null,
          status: 'completed',
          errorCode: null,
          createdAt: '2026-11-06T10:05:00.000Z',
        },
      ],
    },
    financials: {
      grossRevenueIdr: 38000,
      midtransFeeIdr: 266,
      geminiCostIdr: 1000,
      fashnCostIdr: 2700,
      totalCogsIdr: 3966,
      grossProfitIdr: 34034,
      grossMarginPercent: 90,
    },
  },
  transactions: [
    {
      paymentId: 'pay-1',
      providerReference: 'ORDER-001',
      amount: 19000,
      currency: 'IDR',
      status: 'paid',
      paidAt: '2026-11-06T10:00:00.000Z',
      createdAt: '2026-11-06T09:55:00.000Z',
      token: {
        id: 'tok-1',
        status: 'consumed',
        reservedAt: '2026-11-06T09:56:00.000Z',
        consumedAt: '2026-11-06T10:05:00.000Z',
      },
    },
    {
      paymentId: 'pay-2',
      providerReference: 'ORDER-002',
      amount: 19000,
      currency: 'IDR',
      status: 'paid',
      paidAt: '2026-11-06T10:10:00.000Z',
      createdAt: '2026-11-06T10:08:00.000Z',
      token: {
        id: 'tok-2',
        status: 'consumed',
        reservedAt: '2026-11-06T10:09:00.000Z',
        consumedAt: '2026-11-06T10:15:00.000Z',
      },
    },
  ],
  tokens: [],
  jobs: [
    {
      id: 'job-1',
      tokenId: 'tok-1',
      type: 'analysis',
      status: 'completed',
      provider: 'gemini',
      providerReference: 'gem-1',
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
      durationMs: 3000,
      error: null,
      createdAt: '2026-11-06T09:58:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    },
    {
      id: 'job-2',
      tokenId: 'tok-1',
      type: 'virtual_try_on',
      status: 'completed',
      provider: 'fashn',
      providerReference: 'fashn-1',
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
      durationMs: 8000,
      error: null,
      createdAt: '2026-11-06T10:02:00.000Z',
      updatedAt: '2026-11-06T10:05:00.000Z',
    },
  ],
  products: [],
};

describe('Admin Dashboard View - Financial Snapshot Card', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the Gross Profit & Margin card on the Summary tab', () => {
    render(<AdminDashboardView {...baseProps} />);

    expect(screen.getByText('Gross Profit & Margin')).toBeTruthy();
    expect(screen.getByText('Rp 34.034')).toBeTruthy();
    expect(
      screen.getByText(/Margin: 90% · Midtrans MDR: Rp 266/),
    ).toBeTruthy();
  });

  it('navigates to Financials tab and displays period filters and 4 KPI cards', () => {
    render(<AdminDashboardView {...baseProps} />);

    const financialsTabBtn = screen.getByRole('tab', { name: /Financials/i });
    expect(financialsTabBtn).toBeTruthy();

    fireEvent.click(financialsTabBtn);

    expect(screen.getByRole('button', { name: 'Semua Waktu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hari Ini' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '7 Hari Terakhir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bulan Ini' })).toBeTruthy();

    expect(screen.getByText('Gross Revenue')).toBeTruthy();
    expect(screen.getByText('Total COGS (HPP)')).toBeTruthy();
    expect(screen.getByText('Laba Bersih (Net Profit)')).toBeTruthy();
    expect(screen.getByText('Unit Economics (Avg/User)')).toBeTruthy();
  });

  it('renders P&L ledger table and triggers CSV export on click', async () => {
    const createObjectUrlMock = vi.fn().mockReturnValue('blob:mock-csv-url');
    const revokeObjectUrlMock = vi.fn();
    global.URL.createObjectURL = createObjectUrlMock;
    global.URL.revokeObjectURL = revokeObjectUrlMock;
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<AdminDashboardView {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: /Financials/i }));

    expect(screen.getByText('ORDER-001')).toBeTruthy();
    expect(screen.getByText('ORDER-002')).toBeTruthy();
    expect(screen.getAllByText('Rp 133').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rp 15.167')).toBeTruthy();

    const exportBtn = screen.getByRole('button', {
      name: /Download Laporan CSV/i,
    });
    expect(exportBtn).toBeTruthy();

    fireEvent.click(exportBtn);

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:mock-csv-url');

    const exportedBlob = createObjectUrlMock.mock.calls[0][0] as Blob;
    const csvText = await exportedBlob.text();
    expect(csvText).toContain(
      'Order Reference,Paid At,Gross Revenue (IDR),Midtrans Fee 0.7% (IDR),Gemini Cost (IDR),FASHN Cost (IDR),Total COGS (IDR),Gross Profit (IDR),Gross Margin (%)',
    );
    expect(csvText).toContain(
      '"ORDER-001","2026-11-06T10:00:00.000Z",19000,133,1000,2700,3833,15167,80%',
    );

    anchorClickSpy.mockRestore();
  });
});
