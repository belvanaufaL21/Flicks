// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminFinancialsSection } from '../../src/app/admin/components/admin-financials-section';
import {
  AdminJobsSection,
  AdminTransactionsSection,
} from '../../src/app/admin/components/admin-operations-sections';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
} from '../../src/server/admin/admin.service';

afterEach(() => {
  cleanup();
});

const mockSummary: AdminDashboardSummary = {
  transactions: { totalCount: 4, paidCount: 3, totalRevenueIdr: 57000 },
  tokens: {
    totalCount: 4,
    availableCount: 1,
    reservedCount: 1,
    consumedCount: 2,
    expiredCount: 0,
  },
  jobs: {
    totalCount: 3,
    completedCount: 2,
    failedCount: 1,
    successRatePercent: 67,
  },
  costs: {
    geminiEstimatedIdr: 1000,
    fashnActualIdr: 2700,
    totalCostIdr: 3700,
    events: [
      {
        id: 'cost-1',
        jobId: 'job-gemini-1',
        provider: 'gemini',
        feature: 'personal_color',
        model: 'gemini-2.5-flash',
        costType: 'estimated',
        amountIdr: 500,
        inputTokens: 1200,
        outputTokens: 350,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-08T10:00:00.000Z',
      },
      {
        id: 'cost-2',
        jobId: 'job-fashn-1',
        provider: 'fashn',
        feature: 'virtual_try_on',
        model: 'fashn-v1.5',
        costType: 'actual',
        amountIdr: 1350,
        inputTokens: null,
        outputTokens: null,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-08T10:05:00.000Z',
      },
    ],
  },
  financials: {
    grossRevenueIdr: 57000,
    midtransFeeIdr: 399,
    geminiCostIdr: 1000,
    fashnCostIdr: 2700,
    totalCogsIdr: 4099,
    grossProfitIdr: 52901,
    grossMarginPercent: 93,
  },
};

const mockTransactions: AdminTransactionItem[] = [
  {
    paymentId: 'pay-001',
    providerReference: 'ORD-ALPHA',
    amount: 19000,
    currency: 'IDR',
    status: 'paid',
    paidAt: '2026-11-08T10:00:00.000Z',
    createdAt: '2026-11-08T09:50:00.000Z',
    token: {
      id: 'tok-alpha',
      status: 'consumed',
      reservedAt: '2026-11-08T09:55:00.000Z',
      consumedAt: '2026-11-08T10:00:00.000Z',
    },
  },
  {
    paymentId: 'pay-002',
    providerReference: 'ORD-BETA',
    amount: 19000,
    currency: 'IDR',
    status: 'pending',
    paidAt: null,
    createdAt: '2026-11-08T11:00:00.000Z',
    token: null,
  },
  {
    paymentId: 'pay-003',
    providerReference: 'ORD-GAMMA',
    amount: 19000,
    currency: 'IDR',
    status: 'failed',
    paidAt: null,
    createdAt: '2026-11-08T12:00:00.000Z',
    token: null,
  },
];

const mockTokens: AdminTokenItem[] = [
  {
    id: 'tok-alpha',
    status: 'consumed',
    paymentId: 'pay-001',
    reservedAt: '2026-11-08T09:55:00.000Z',
    consumedAt: '2026-11-08T10:00:00.000Z',
    createdAt: '2026-11-08T09:50:00.000Z',
  },
  {
    id: 'tok-beta',
    status: 'available',
    paymentId: null,
    reservedAt: null,
    consumedAt: null,
    createdAt: '2026-11-08T09:50:00.000Z',
  },
];

const mockJobs: AdminJobItem[] = [
  {
    id: 'job-gemini-1',
    tokenId: 'tok-alpha',
    type: 'analysis',
    status: 'completed',
    provider: 'gemini',
    providerReference: 'gem-ref-1',
    attemptCount: 1,
    tokenRecoveryStatus: 'none',
    durationMs: 2500,
    error: null,
    createdAt: '2026-11-08T10:01:00.000Z',
    updatedAt: '2026-11-08T10:01:02.500Z',
  },
  {
    id: 'job-fashn-1',
    tokenId: 'tok-alpha',
    type: 'vto',
    status: 'completed',
    provider: 'fashn',
    providerReference: 'fashn-ref-1',
    attemptCount: 1,
    tokenRecoveryStatus: 'none',
    durationMs: 14200,
    error: null,
    createdAt: '2026-11-08T10:02:00.000Z',
    updatedAt: '2026-11-08T10:02:14.200Z',
  },
  {
    id: 'job-fashn-2',
    tokenId: 'tok-beta',
    type: 'vto',
    status: 'failed',
    provider: 'fashn',
    providerReference: null,
    attemptCount: 3,
    tokenRecoveryStatus: 'recovered',
    durationMs: 500,
    error: 'Model timeout after 3 attempts',
    createdAt: '2026-11-08T10:05:00.000Z',
    updatedAt: '2026-11-08T10:05:05.000Z',
  },
];

describe('AdminFinancialsSection', () => {
  beforeEach(() => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-csv');
    window.URL.revokeObjectURL = vi.fn();
  });

  it('renders P&L ledger cards, breakdown rows, and handles period filter', () => {
    render(
      <AdminFinancialsSection
        summary={mockSummary}
        transactions={mockTransactions}
      />,
    );

    // Sub-tab tabs
    expect(screen.getByRole('tab', { name: /P&L Ledger/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Usage & Costs/i })).toBeTruthy();

    // 4 KPI Cards
    expect(screen.getByText('Gross Revenue')).toBeTruthy();
    expect(screen.getAllByText('Rp 19.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Total COGS (HPP)')).toBeTruthy();
    expect(screen.getByText('Laba Bersih (Net Profit)')).toBeTruthy();
    expect(screen.getByText('Unit Economics (Avg/User)')).toBeTruthy();

    // Period filter buttons
    const todayBtn = screen.getByRole('button', { name: 'Hari Ini' });
    fireEvent.click(todayBtn);
    expect(todayBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches to Costs sub-tab and displays cost breakdown and event logs', () => {
    render(
      <AdminFinancialsSection
        summary={mockSummary}
        transactions={mockTransactions}
      />,
    );

    const costsTab = screen.getByRole('tab', { name: /Usage & Costs/i });
    fireEvent.click(costsTab);

    expect(screen.getByText('Estimated (Gemini Analysis)')).toBeTruthy();
    expect(screen.getByText('Actual (FASHN VTO)')).toBeTruthy();
    expect(screen.getByText('Total Provider Spend')).toBeTruthy();
    expect(screen.getByText(/Provider Usage & Cost Events/i)).toBeTruthy();
  });

  it('triggers CSV download with BOM when Export CSV is clicked', () => {
    render(
      <AdminFinancialsSection
        summary={mockSummary}
        transactions={mockTransactions}
      />,
    );

    const exportBtn = screen.getByRole('button', {
      name: /Download Laporan CSV/i,
    });
    fireEvent.click(exportBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('AdminTransactionsSection', () => {
  it('renders transactions and tokens tables and filters by search and status', () => {
    render(
      <AdminTransactionsSection
        transactions={mockTransactions}
        tokens={mockTokens}
      />,
    );

    expect(screen.getByText('Payment Transactions')).toBeTruthy();
    expect(screen.getByText('Issued Access Tokens')).toBeTruthy();
    expect(screen.getByText('ORD-ALPHA')).toBeTruthy();
    expect(screen.getByText('ORD-BETA')).toBeTruthy();
    expect(screen.getByText('tok-alpha')).toBeTruthy();

    // Search filter
    const searchInput = screen.getByPlaceholderText(
      'Cari Order Ref, Payment ID, atau Token ID…',
    );
    fireEvent.change(searchInput, { target: { value: 'ALPHA' } });
    expect(screen.getByText('ORD-ALPHA')).toBeTruthy();
    expect(screen.queryByText('ORD-BETA')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Status filter
    const paidFilter = screen.getByRole('button', { name: 'Paid' });
    fireEvent.click(paidFilter);
    expect(screen.getByText('ORD-ALPHA')).toBeTruthy();
    expect(screen.queryByText('ORD-BETA')).toBeNull();
  });

  it('toggles table view mode between transactions, tokens, and all', () => {
    render(
      <AdminTransactionsSection
        transactions={mockTransactions}
        tokens={mockTokens}
      />,
    );

    const tokensViewBtn = screen.getByRole('button', { name: 'Token Akses' });
    fireEvent.click(tokensViewBtn);

    expect(screen.queryByText('Payment Transactions')).toBeNull();
    expect(screen.getByText('Issued Access Tokens')).toBeTruthy();

    const txViewBtn = screen.getByRole('button', { name: 'Transaksi Pembayaran' });
    fireEvent.click(txViewBtn);

    expect(screen.getByText('Payment Transactions')).toBeTruthy();
    expect(screen.queryByText('Issued Access Tokens')).toBeNull();
  });
});

describe('AdminJobsSection', () => {
  it('renders jobs list and filters by provider and status', () => {
    render(<AdminJobsSection jobs={mockJobs} />);

    expect(screen.getByText('AI & VTO Jobs')).toBeTruthy();
    expect(screen.getByText(/#job-gemin/)).toBeTruthy();
    expect(screen.getAllByText(/#job-fashn/).length).toBe(2);
    expect(screen.getByText('2.5s')).toBeTruthy();
    expect(screen.getByText('14.2s')).toBeTruthy();

    // Filter by provider: fashn
    const fashnBtn = screen.getByRole('button', { name: 'FASHN' });
    fireEvent.click(fashnBtn);

    expect(screen.queryByText(/#job-gemin/)).toBeNull();
    expect(screen.getAllByText(/#job-fashn/).length).toBe(2);

    // Filter by status: failed
    const failedBtn = screen.getByRole('button', { name: 'Failed' });
    fireEvent.click(failedBtn);

    expect(screen.getByText('Model timeout after 3 attempts')).toBeTruthy();
    expect(screen.queryByText('14.2s')).toBeNull();
  });
});
