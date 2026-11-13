'use client';

import React, { useState } from 'react';
import styles from '../admin.module.css';
import {
  IconDollarSign,
  IconTrendingUp,
  IconCoins,
  IconActivity,
  IconInbox,
  IconPause,
  IconPlay,
  IconTrash,
} from './admin-icons';
import {
  formatDateTime,
  formatIdr,
  type AdminTabKey,
  type KillSwitchViewState,
} from '../admin-formatters';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
} from '@/server/admin/admin.service';

export interface AdminOverviewSectionProps {
  summary: AdminDashboardSummary;
  transactions: AdminTransactionItem[];
  jobs: AdminJobItem[];
  tokens: AdminTokenItem[];
  killSwitch?: KillSwitchViewState;
  onNavigate: (tab: AdminTabKey) => void;
  onRequestPauseKillSwitch?: () => void;
  onResumeKillSwitch?: () => void;
  onTriggerCleanup?: () => Promise<{ deletedCount: number; mode: string } | void> | void;
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'active':
    case 'consumed':
      return styles.badgeSuccess;
    case 'pending':
    case 'processing':
      return styles.badgeWarning;
    case 'failed':
    case 'paused':
    case 'expired':
      return styles.badgeDanger;
    case 'reserved':
    case 'available':
      return styles.badgeInfo;
    default:
      return '';
  }
}

export function AdminOverviewSection({
  summary,
  transactions,
  jobs,
  killSwitch,
  onNavigate,
  onRequestPauseKillSwitch,
  onResumeKillSwitch,
  onTriggerCleanup,
}: AdminOverviewSectionProps) {
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);

  const handleCleanup = async () => {
    if (isCleaning || !onTriggerCleanup) return;
    setIsCleaning(true);
    setCleanupFeedback('Menjalankan pembersihan foto kadaluarsa...');
    try {
      const res = await onTriggerCleanup();
      if (res && typeof res.deletedCount === 'number') {
        setCleanupFeedback(
          `✓ ${res.deletedCount} foto kedaluwarsa dibersihkan · Cleaned ${res.deletedCount} expired photo(s).`,
        );
      } else {
        setCleanupFeedback('✓ Pembersihan foto kadaluarsa selesai.');
      }
    } catch {
      setCleanupFeedback('Gagal menjalankan pembersihan foto.');
    } finally {
      setIsCleaning(false);
    }
  };

  const grossRevenue =
    summary.financials?.grossRevenueIdr ??
    summary.transactions.totalRevenueIdr;
  const grossProfit = summary.financials?.grossProfitIdr ?? 0;
  const grossMargin = summary.financials?.grossMarginPercent ?? 0;
  const midtransFee = summary.financials?.midtransFeeIdr ?? 0;
  const geminiCost = summary.costs.geminiEstimatedIdr;
  const fashnCost = summary.costs.fashnActualIdr;

  const maxBarValue = Math.max(
    grossRevenue,
    grossProfit,
    geminiCost + fashnCost + midtransFee,
    1,
  );

  const getBarWidth = (val: number) => {
    if (val <= 0) return '0%';
    const pct = Math.min(100, Math.max(3, Math.round((val / maxBarValue) * 100)));
    return `${pct}%`;
  };

  const recentTransactions = transactions.slice(0, 5);
  const recentJobs = jobs.slice(0, 5);

  return (
    <section aria-label="Command Center Overview">
      {/* 4 KPI Stat Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.metricLabel}>Verified Revenue</span>
            <div className={styles.kpiIconWrap} aria-hidden="true">
              <IconDollarSign size={15} />
            </div>
          </div>
          <div>
            <div className={`${styles.metricValue} ${styles.tabularNums}`}>
              {formatIdr(summary.transactions.totalRevenueIdr)}
            </div>
            <div className={styles.metricSubtext}>
              {summary.transactions.paidCount} dari{' '}
              {summary.transactions.totalCount} transaksi lunas
            </div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.metricLabel}>Gross Profit &amp; Margin</span>
            <div className={styles.kpiIconWrap} aria-hidden="true">
              <IconTrendingUp size={15} />
            </div>
          </div>
          <div>
            <div className={`${styles.metricValue} ${styles.tabularNums}`}>
              {formatIdr(grossProfit)}
            </div>
            <div className={styles.metricSubtext}>
              Margin: {grossMargin}% · Midtrans MDR: {formatIdr(midtransFee)}
            </div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.metricLabel}>Token Lifecycle</span>
            <div className={styles.kpiIconWrap} aria-hidden="true">
              <IconCoins size={15} />
            </div>
          </div>
          <div>
            <div className={`${styles.metricValue} ${styles.tabularNums}`}>
              {summary.tokens.availableCount} Tersedia
            </div>
            <div className={styles.metricSubtext}>
              Reserved {summary.tokens.reservedCount} · Consumed{' '}
              {summary.tokens.consumedCount} · Expired {summary.tokens.expiredCount}
            </div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.metricLabel}>Job Success Rate</span>
            <div className={styles.kpiIconWrap} aria-hidden="true">
              <IconActivity size={15} />
            </div>
          </div>
          <div>
            <div className={`${styles.metricValue} ${styles.tabularNums}`}>
              {summary.jobs.successRatePercent}%
            </div>
            <div className={styles.metricSubtext}>
              {summary.jobs.completedCount} sukses · {summary.jobs.failedCount} gagal
              ({summary.jobs.totalCount} total)
            </div>
          </div>
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className={styles.bentoGrid}>
        {/* Left Bento Column (1.45fr) */}
        <div className={styles.bentoColumn}>
          {/* Revenue vs COGS Breakdown */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Revenue vs COGS Breakdown</h3>
                <p className={styles.cardSubtitle}>
                  Proporsi pendapatan terhadap beban pokok operasional AI &amp; Payment Gateway
                </p>
              </div>
            </div>

            <div className={styles.chartContainer}>
              <div className={styles.chartBarRow}>
                <div className={styles.chartBarLabelRow}>
                  <span style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>
                    Gross Revenue
                  </span>
                  <span className={styles.tabularNums} style={{ fontWeight: 700 }}>
                    {formatIdr(grossRevenue)}
                  </span>
                </div>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{
                      width: getBarWidth(grossRevenue),
                      backgroundColor: 'var(--admin-navy)',
                    }}
                  />
                </div>
              </div>

              <div className={styles.chartBarRow}>
                <div className={styles.chartBarLabelRow}>
                  <span style={{ fontWeight: 600, color: 'var(--admin-sage)' }}>
                    Gross Profit (Laba Bersih)
                  </span>
                  <span className={styles.tabularNums} style={{ fontWeight: 700, color: 'var(--admin-sage)' }}>
                    {formatIdr(grossProfit)} ({grossMargin}%)
                  </span>
                </div>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{
                      width: getBarWidth(grossProfit),
                      backgroundColor: 'var(--admin-sage)',
                    }}
                  />
                </div>
              </div>

              <div className={styles.chartBarRow}>
                <div className={styles.chartBarLabelRow}>
                  <span style={{ color: '#475569' }}>
                    Actual (FASHN VTO)
                  </span>
                  <span className={styles.tabularNums}>
                    {formatIdr(fashnCost)}
                  </span>
                </div>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{
                      width: getBarWidth(fashnCost),
                      backgroundColor: 'var(--admin-sand)',
                    }}
                  />
                </div>
              </div>

              <div className={styles.chartBarRow}>
                <div className={styles.chartBarLabelRow}>
                  <span style={{ color: '#475569' }}>
                    Estimated (Gemini Analysis)
                  </span>
                  <span className={styles.tabularNums}>
                    {formatIdr(geminiCost)}
                  </span>
                </div>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{
                      width: getBarWidth(geminiCost),
                      backgroundColor: 'var(--admin-slate)',
                    }}
                  />
                </div>
              </div>

              <div className={styles.chartBarRow}>
                <div className={styles.chartBarLabelRow}>
                  <span style={{ color: '#64748B' }}>
                    Midtrans MDR (0.7%)
                  </span>
                  <span className={styles.tabularNums}>
                    {formatIdr(midtransFee)}
                  </span>
                </div>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{
                      width: getBarWidth(midtransFee),
                      backgroundColor: '#94A3B8',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 5 Transaksi Terakhir */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Transaksi Pembayaran Terakhir</h3>
                <p className={styles.cardSubtitle}>
                  5 transaksi terbaru yang tercatat di sistem
                </p>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onNavigate('transactions')}
              >
                Lihat Semua ({transactions.length}) →
              </button>
            </div>

            {recentTransactions.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.tableHeaderCell}>
                        Order Ref
                      </th>
                      <th scope="col" className={styles.tableHeaderCell}>
                        Nominal
                      </th>
                      <th scope="col" className={styles.tableHeaderCell}>
                        Status
                      </th>
                      <th scope="col" className={styles.tableHeaderCell}>
                        Token
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => (
                      <tr key={tx.paymentId}>
                        <td
                          className={styles.tableCell}
                          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }}
                        >
                          {tx.providerReference}
                        </td>
                        <td className={styles.tableCell}>
                          {formatIdr(tx.amount)}
                        </td>
                        <td className={styles.tableCell}>
                          <span
                            className={`${styles.badge} ${getStatusBadgeClass(
                              tx.status,
                            )}`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className={styles.tableCell}>
                          {tx.token ? (
                            <span
                              className={`${styles.badge} ${getStatusBadgeClass(
                                tx.token.status,
                              )}`}
                            >
                              {tx.token.status}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon} aria-hidden="true">
                  <IconInbox size={22} />
                </div>
                <div className={styles.emptyStateTitle}>Belum ada transaksi</div>
                <p className={styles.emptyStateText}>
                  Belum ada transaksi pembayaran yang tercatat di sistem.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Bento Column (1fr) */}
        <div className={styles.bentoColumn}>
          {/* Kontrol Sistem & Proteksi */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Kontrol Sistem &amp; Proteksi</h3>
                <p className={styles.cardSubtitle}>
                  Kendali operasional darurat dan pemeliharaan storage
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Emergency AI Kill Switch */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: killSwitch?.paidWorkPaused
                    ? 'var(--admin-danger-bg)'
                    : '#F8FAFC',
                  border: `1px solid ${
                    killSwitch?.paidWorkPaused ? '#FECACA' : 'var(--admin-border)'
                  }`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Emergency AI Kill Switch
                  </span>
                  <span
                    className={`${styles.badge} ${
                      killSwitch?.paidWorkPaused
                        ? styles.badgeDanger
                        : styles.badgeSuccess
                    }`}
                  >
                    <span
                      className={`${styles.statusDot} ${
                        killSwitch?.paidWorkPaused
                          ? styles.statusDotInactive
                          : styles.statusDotActive
                      }`}
                    />
                    {killSwitch?.paidWorkPaused
                      ? 'AI Engine: Paused'
                      : 'AI Engine: Active'}
                  </span>
                </div>

                <p
                  className={styles.metricSubtext}
                  style={{
                    marginBottom: '0.75rem',
                    color: killSwitch?.paidWorkPaused ? '#991B1B' : '#64748B',
                  }}
                >
                  {killSwitch?.paidWorkPaused
                    ? `AI berbayar dijeda. Alasan: "${killSwitch.reason || 'Tidak ada alasan'}"`
                    : 'AI berbayar aktif melayani permintaan analisis dan VTO.'}
                </p>

                {killSwitch?.paidWorkPaused ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    style={{ width: '100%', background: '#16A34A', borderColor: '#16A34A' }}
                    onClick={onResumeKillSwitch}
                  >
                    <IconPlay size={16} aria-hidden="true" />
                    Resume Paid AI Work
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    style={{ width: '100%' }}
                    onClick={onRequestPauseKillSwitch}
                  >
                    <IconPause size={16} aria-hidden="true" />
                    Pause Paid AI Work
                  </button>
                )}
              </div>

              {/* Bersihkan Foto Kedaluwarsa */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid var(--admin-border)',
                }}
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Pembersihan Foto (&gt;72 Jam)
                  </span>
                  <p className={styles.metricSubtext} style={{ marginTop: '0.25rem' }}>
                    Sesuai retensi privasi, foto pengguna dan hasil generate yang
                    berusia lebih dari 72 jam dihapus otomatis.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{ width: '100%' }}
                  disabled={isCleaning}
                  onClick={() => void handleCleanup()}
                  aria-label="Bersihkan Foto >72 Jam (Cleanup Expired Photos)"
                >
                  <IconTrash size={16} aria-hidden="true" />
                  {isCleaning ? 'Membersihkan...' : 'Bersihkan Foto >72 Jam'}
                </button>

                {cleanupFeedback ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className={styles.metricSubtext}
                    style={{
                      marginTop: '0.5rem',
                      color: cleanupFeedback.startsWith('✓') ? '#166534' : '#991B1B',
                      fontWeight: 500,
                    }}
                  >
                    {cleanupFeedback}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Aktivitas AI & VTO Terbaru */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Aktivitas AI &amp; VTO Terbaru</h3>
                <p className={styles.cardSubtitle}>
                  5 job pemrosesan terakhir
                </p>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onNavigate('jobs')}
              >
                Lihat Semua ({jobs.length}) →
              </button>
            </div>

            {recentJobs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.75rem',
                      background: '#F8FAFC',
                      borderRadius: '8px',
                      border: '1px solid #F1F5F9',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: 'var(--admin-ink)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>{job.type}</span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#64748B',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          #{job.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className={styles.metricSubtext} style={{ margin: 0 }}>
                        {formatDateTime(job.createdAt)} · Durasi:{' '}
                        {formatDurationMs(job.durationMs)}
                      </div>
                    </div>

                    <span
                      className={`${styles.badge} ${getStatusBadgeClass(
                        job.status,
                      )}`}
                    >
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon} aria-hidden="true">
                  <IconInbox size={22} />
                </div>
                <div className={styles.emptyStateTitle}>Belum ada job AI</div>
                <p className={styles.emptyStateText}>
                  Belum ada aktivitas job AI yang tercatat di sistem.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
