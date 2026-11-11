// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminConfirmDialog } from '../../src/app/admin/components/admin-confirm-dialog';
import { AdminOverviewSection } from '../../src/app/admin/components/admin-overview-section';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
} from '../../src/server/admin/admin.service';

afterEach(() => {
  cleanup();
});

describe('AdminConfirmDialog', () => {
  it('renders modal dialog with accessible labels and handles callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <AdminConfirmDialog
        title="Konfirmasi Jeda AI"
        description="Apakah Anda yakin ingin menjeda pemrosesan AI?"
        confirmLabel="Ya, Jeda AI"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Konfirmasi Jeda AI')).toBeTruthy();
    expect(
      screen.getByText('Apakah Anda yakin ingin menjeda pemrosesan AI?'),
    ).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: 'Ya, Jeda AI' });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: 'Batal' });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles Escape key to cancel', () => {
    const onCancel = vi.fn();
    render(
      <AdminConfirmDialog
        title="Test Escape"
        description="Test desc"
        confirmLabel="OK"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders optional reason input field', () => {
    const onChangeReason = vi.fn();
    render(
      <AdminConfirmDialog
        title="Jeda AI"
        description="Deskripsi"
        confirmLabel="Jeda"
        reasonField={{
          label: 'Alasan Jeda',
          placeholder: 'Contoh: Maintenance',
          value: 'Investigasi error',
          onChange: onChangeReason,
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Contoh: Maintenance') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Investigasi error');

    fireEvent.change(input, { target: { value: 'Rate limit' } });
    expect(onChangeReason).toHaveBeenCalledWith('Rate limit');
  });
});

describe('AdminOverviewSection', () => {
  const mockSummary: AdminDashboardSummary = {
    transactions: { totalCount: 5, paidCount: 3, totalRevenueIdr: 57000 },
    tokens: {
      totalCount: 5,
      availableCount: 2,
      reservedCount: 1,
      consumedCount: 2,
      expiredCount: 0,
    },
    jobs: {
      totalCount: 4,
      completedCount: 3,
      failedCount: 1,
      successRatePercent: 75,
    },
    costs: {
      geminiEstimatedIdr: 1500,
      fashnActualIdr: 4050,
      totalCostIdr: 5550,
      events: [],
    },
    financials: {
      grossRevenueIdr: 57000,
      midtransFeeIdr: 399,
      geminiCostIdr: 1500,
      fashnCostIdr: 4050,
      totalCogsIdr: 5949,
      grossProfitIdr: 51051,
      grossMarginPercent: 90,
    },
  };

  const mockTransactions: AdminTransactionItem[] = [
    {
      paymentId: 'pay-1',
      providerReference: 'ORDER-101',
      amount: 19000,
      currency: 'IDR',
      status: 'paid',
      paidAt: '2026-11-08T10:00:00.000Z',
      createdAt: '2026-11-08T09:50:00.000Z',
      token: {
        id: 'tok-1',
        status: 'consumed',
        reservedAt: '2026-11-08T09:55:00.000Z',
        consumedAt: '2026-11-08T10:00:00.000Z',
      },
    },
  ];

  const mockJobs: AdminJobItem[] = [
    {
      id: 'job-101',
      tokenId: 'tok-1',
      type: 'analysis',
      status: 'completed',
      provider: 'gemini',
      providerReference: null,
      attemptCount: 1,
      tokenRecoveryStatus: 'none',
      durationMs: 3000,
      error: null,
      createdAt: '2026-11-08T09:55:00.000Z',
      updatedAt: '2026-11-08T09:55:03.000Z',
    },
  ];

  const mockTokens: AdminTokenItem[] = [];

  it('renders 4 KPI stat cards and exact cost comparison labels', () => {
    const onNavigate = vi.fn();
    render(
      <AdminOverviewSection
        summary={mockSummary}
        transactions={mockTransactions}
        jobs={mockJobs}
        tokens={mockTokens}
        onNavigate={onNavigate}
      />,
    );

    // KPIs
    expect(screen.getByText('Verified Revenue')).toBeTruthy();
    expect(screen.getAllByText('Rp 57.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Gross Profit & Margin')).toBeTruthy();
    expect(screen.getByText('Token Lifecycle')).toBeTruthy();
    expect(screen.getByText('2 Tersedia')).toBeTruthy();
    expect(screen.getByText('Job Success Rate')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();

    // Bar breakdown exact labels
    expect(screen.getByText('Estimated (Gemini Analysis)')).toBeTruthy();
    expect(screen.getByText('Actual (FASHN VTO)')).toBeTruthy();

    // Recent tx and jobs
    expect(screen.getByText('ORDER-101')).toBeTruthy();
    expect(screen.getByText(/#job-101/)).toBeTruthy();
  });

  it('triggers Kill Switch pause request when Pause button is clicked', () => {
    const onRequestPause = vi.fn();
    render(
      <AdminOverviewSection
        summary={mockSummary}
        transactions={mockTransactions}
        jobs={mockJobs}
        tokens={mockTokens}
        killSwitch={{ paidWorkPaused: false, reason: null, updatedAt: '' }}
        onNavigate={vi.fn()}
        onRequestPauseKillSwitch={onRequestPause}
      />,
    );

    const pauseBtn = screen.getByRole('button', { name: /Pause Paid AI Work/i });
    fireEvent.click(pauseBtn);
    expect(onRequestPause).toHaveBeenCalledTimes(1);
  });

  it('triggers cleanup and displays live feedback status', async () => {
    const onTriggerCleanup = vi.fn().mockResolvedValue({
      deletedCount: 4,
      mode: 'supabase',
    });

    render(
      <AdminOverviewSection
        summary={mockSummary}
        transactions={mockTransactions}
        jobs={mockJobs}
        tokens={mockTokens}
        onNavigate={vi.fn()}
        onTriggerCleanup={onTriggerCleanup}
      />,
    );

    const cleanupBtn = screen.getByRole('button', { name: /Bersihkan Foto >72 Jam/i });
    fireEvent.click(cleanupBtn);

    expect(onTriggerCleanup).toHaveBeenCalledTimes(1);
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('4 foto kedaluwarsa dibersihkan');
  });
});
