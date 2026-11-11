'use client';

import React, { useMemo, useState } from 'react';
import styles from '../admin.module.css';
import {
  buildFinancialLedgerEntries,
  computeFinancialKpis,
  filterTransactionsByPeriod,
  formatIdr,
  sanitizeCsvCell,
  type FinancialPeriodFilter,
} from '../admin-formatters';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTransactionItem,
  AdminUsageCostItem,
} from '@/server/admin/admin.service';

export interface AdminFinancialsSectionProps {
  summary: AdminDashboardSummary;
  transactions: AdminTransactionItem[];
  jobs?: AdminJobItem[];
  activeSubTab?: 'ledger' | 'costs';
  onSubTabChange?: (subTab: 'ledger' | 'costs') => void;
}

const PERIOD_OPTIONS: Array<{ key: FinancialPeriodFilter; label: string }> = [
  { key: 'all', label: 'Semua Waktu' },
  { key: 'today', label: 'Hari Ini' },
  { key: '7days', label: '7 Hari Terakhir' },
  { key: 'thisMonth', label: 'Bulan Ini' },
];

export function AdminFinancialsSection({
  summary,
  transactions,
  jobs,
  activeSubTab: controlledSubTab,
  onSubTabChange,
}: AdminFinancialsSectionProps) {
  const [internalSubTab, setInternalSubTab] = useState<'ledger' | 'costs'>('ledger');
  const [financialPeriod, setFinancialPeriod] = useState<FinancialPeriodFilter>('all');
  const [costSearch, setCostSearch] = useState('');
  const [costProviderFilter, setCostProviderFilter] = useState<'all' | 'gemini' | 'fashn'>('all');

  const subTab = controlledSubTab ?? internalSubTab;
  const setSubTab = (nextTab: 'ledger' | 'costs') => {
    if (onSubTabChange) {
      onSubTabChange(nextTab);
    } else {
      setInternalSubTab(nextTab);
    }
  };

  // Filtered transactions for P&L Ledger
  const filteredTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, financialPeriod),
    [transactions, financialPeriod],
  );

  const financialLedgerEntries = useMemo(
    () =>
      buildFinancialLedgerEntries(
        filteredTransactions,
        jobs ?? [],
        summary.costs.events ?? [],
      ),
    [filteredTransactions, jobs, summary.costs.events],
  );

  const filteredKpis = useMemo(
    () => computeFinancialKpis(financialLedgerEntries),
    [financialLedgerEntries],
  );

  // Filtered usage cost events
  const rawCostEvents = summary.costs.events;
  const filteredCostEvents = useMemo(() => {
    const list = rawCostEvents ?? [];
    const q = costSearch.trim().toLowerCase();
    return list.filter((ev) => {
      const matchProvider =
        costProviderFilter === 'all' || ev.provider === costProviderFilter;
      if (!matchProvider) return false;

      if (!q) return true;
      const haystack = `${ev.id} ${ev.jobId} ${ev.feature} ${ev.model} ${ev.costType} ${ev.provider}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rawCostEvents, costSearch, costProviderFilter]);

  // CSV Export
  const handleExportCsv = () => {
    const header = [
      'Order Reference',
      'Tanggal Bayar',
      'Pendapatan (IDR)',
      'Fee Midtrans (IDR)',
      'Beban Gemini (IDR)',
      'Beban FASHN (IDR)',
      'Laba Kotor (IDR)',
      'Margin (%)',
    ];

    const rows = financialLedgerEntries.map((entry) => [
      sanitizeCsvCell(entry.orderReference),
      sanitizeCsvCell(entry.paidAt),
      sanitizeCsvCell(entry.revenueIdr),
      sanitizeCsvCell(entry.midtransFeeIdr),
      sanitizeCsvCell(entry.geminiCostIdr),
      sanitizeCsvCell(entry.fashnCostIdr),
      sanitizeCsvCell(entry.grossProfitIdr),
      sanitizeCsvCell(`${entry.grossMarginPercent}%`),
    ]);

    // ponytail: client-side CSV blob; use server streaming if ledger entries > 10,000
    const csvContent =
      '\uFEFF' +
      header.join(',') +
      '\n' +
      rows.map((r) => r.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-keuangan-flicks-${financialPeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Financials and Cost Monitoring">
      {/* Sub-tab Navigation */}
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Financials sub-sections"
      >
        <button
          type="button"
          role="tab"
          id="tab-ledger"
          aria-selected={subTab === 'ledger'}
          aria-controls="panel-ledger"
          className={`${styles.tabButton} ${
            subTab === 'ledger' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setSubTab('ledger')}
        >
          P&amp;L Ledger (Buku Besar)
        </button>
        <button
          type="button"
          role="tab"
          id="tab-costs"
          aria-selected={subTab === 'costs'}
          aria-controls="panel-costs"
          className={`${styles.tabButton} ${
            subTab === 'costs' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setSubTab('costs')}
        >
          Usage &amp; Costs (Biaya AI)
        </button>
      </div>

      {/* Sub-tab 1: P&L Ledger */}
      {subTab === 'ledger' ? (
        <div
          id="panel-ledger"
          role="tabpanel"
          aria-labelledby="tab-ledger"
        >
          {/* Header Controls: Period Filter & CSV Download */}
          <div className={styles.financialHeader}>
            <div
              className={styles.periodFilterGroup}
              role="group"
              aria-label="Filter periode keuangan"
            >
              {PERIOD_OPTIONS.map((period) => (
                <button
                  key={period.key}
                  type="button"
                  aria-pressed={financialPeriod === period.key}
                  className={`${styles.periodChip} ${
                    financialPeriod === period.key ? styles.periodChipActive : ''
                  }`}
                  onClick={() => setFinancialPeriod(period.key)}
                >
                  {period.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleExportCsv}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Laporan CSV
            </button>
          </div>

          {/* 4 KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.card}>
              <div className={styles.metricLabel}>Gross Revenue</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(filteredKpis.grossRevenueIdr)}
              </div>
              <div className={styles.metricSubtext}>
                {filteredKpis.paidCount} transaksi lunas
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.metricLabel}>Total COGS (HPP)</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(filteredKpis.totalCogsIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Midtrans: {formatIdr(filteredKpis.midtransFeeIdr)} · Gemini:{' '}
                {formatIdr(filteredKpis.geminiCostIdr)} · FASHN:{' '}
                {formatIdr(filteredKpis.fashnCostIdr)}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.metricLabel}>Laba Bersih (Net Profit)</div>
              <div
                className={`${styles.metricValue} ${styles.tabularNums}`}
                style={{ color: 'var(--admin-sage)' }}
              >
                {formatIdr(filteredKpis.grossProfitIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Gross Margin: {filteredKpis.grossMarginPercent}%
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.metricLabel}>Unit Economics (Avg/User)</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(filteredKpis.avgProfitPerUserIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Avg COGS/User: {formatIdr(filteredKpis.avgCogsPerUserIdr)}
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className={styles.card} style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  Buku Besar Laba/Rugi (P&amp;L Ledger per Sesi)
                </h3>
                <p className={styles.cardSubtitle}>
                  Rincian pendapatan kotor, MDR Midtrans 0.7%, dan COGS AI (Gemini &amp; FASHN) per transaksi
                </p>
              </div>
            </div>

            <table className={styles.dataTable} aria-label="Tabel Buku Besar Laba Rugi">
              <thead>
                <tr>
                  <th scope="col" className={styles.tableHeaderCell}>Order Ref</th>
                  <th scope="col" className={styles.tableHeaderCell}>Tanggal Bayar</th>
                  <th scope="col" className={styles.tableHeaderCell}>Pendapatan</th>
                  <th scope="col" className={styles.tableHeaderCell}>Fee Midtrans (0.7%)</th>
                  <th scope="col" className={styles.tableHeaderCell}>Beban Gemini</th>
                  <th scope="col" className={styles.tableHeaderCell}>Beban FASHN</th>
                  <th scope="col" className={styles.tableHeaderCell}>Laba Kotor</th>
                  <th scope="col" className={styles.tableHeaderCell}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {financialLedgerEntries.length > 0 ? (
                  financialLedgerEntries.map((entry) => (
                    <tr key={entry.paymentId}>
                      <td className={styles.tableCell}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--admin-ink)',
                          }}
                        >
                          {entry.orderReference}
                        </span>
                      </td>
                      <td className={styles.tableCell}>{entry.paidAt}</td>
                      <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                        {formatIdr(entry.revenueIdr)}
                      </td>
                      <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                        {formatIdr(entry.midtransFeeIdr)}
                      </td>
                      <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                        {formatIdr(entry.geminiCostIdr)}
                      </td>
                      <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                        {formatIdr(entry.fashnCostIdr)}
                      </td>
                      <td
                        className={`${styles.tableCell} ${styles.tabularNums}`}
                        style={{ fontWeight: 700, color: 'var(--admin-ink)' }}
                      >
                        {formatIdr(entry.grossProfitIdr)}
                      </td>
                      <td className={styles.tableCell}>
                        <span
                          className={`${styles.badge} ${
                            entry.grossMarginPercent >= 50
                              ? styles.badgeSuccess
                              : styles.badgeWarning
                          }`}
                        >
                          {entry.grossMarginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className={styles.tableCell}
                      style={{ textAlign: 'center', color: '#64748B', padding: '2rem 1rem' }}
                    >
                      Tidak ada transaksi pada periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Sub-tab 2: Usage & Costs */}
      {subTab === 'costs' ? (
        <div
          id="panel-costs"
          role="tabpanel"
          aria-labelledby="tab-costs"
        >
          {/* 3 Summary Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.card}>
              <div className={styles.metricLabel}>Estimated (Gemini Analysis)</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(summary.costs.geminiEstimatedIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Estimasi biaya analisis personal color &amp; body shape
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.metricLabel}>Actual (FASHN VTO)</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(summary.costs.fashnActualIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Biaya aktual generasi visual Virtual Try-On
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.metricLabel}>Total Provider Spend</div>
              <div className={`${styles.metricValue} ${styles.tabularNums}`}>
                {formatIdr(summary.costs.totalCostIdr)}
              </div>
              <div className={styles.metricSubtext}>
                Akumulasi seluruh beban komputasi AI
              </div>
            </div>
          </div>

          {/* Costs Table Container */}
          <div className={styles.card} style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  Provider Usage &amp; Cost Events
                </h3>
                <p className={styles.cardSubtitle}>
                  Log pemakaian komputasi per sesi AI (Gemini input/output tokens dan FASHN renders)
                </p>
              </div>
            </div>

            {/* Toolbar: Search and Filter */}
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Cari Job ID, model, atau fitur…"
                  value={costSearch}
                  onChange={(e) => setCostSearch(e.target.value)}
                  spellCheck={false}
                  aria-label="Cari event biaya komputasi"
                />
                <div
                  className={styles.chipGroup}
                  role="group"
                  aria-label="Filter provider"
                >
                  {(
                    [
                      { key: 'all', label: 'Semua Provider' },
                      { key: 'gemini', label: 'Gemini' },
                      { key: 'fashn', label: 'FASHN' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={costProviderFilter === p.key}
                      className={`${styles.chip} ${
                        costProviderFilter === p.key ? styles.chipActive : ''
                      }`}
                      onClick={() => setCostProviderFilter(p.key)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <table className={styles.dataTable} aria-label="Tabel Biaya Komputasi AI">
              <thead>
                <tr>
                  <th scope="col" className={styles.tableHeaderCell}>Provider</th>
                  <th scope="col" className={styles.tableHeaderCell}>Fitur</th>
                  <th scope="col" className={styles.tableHeaderCell}>Model</th>
                  <th scope="col" className={styles.tableHeaderCell}>Tipe Beban</th>
                  <th scope="col" className={styles.tableHeaderCell}>Tokens (In / Out)</th>
                  <th scope="col" className={styles.tableHeaderCell}>Beban (IDR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredCostEvents.length > 0 ? (
                  filteredCostEvents.map((ev: AdminUsageCostItem) => (
                    <tr key={ev.id}>
                      <td className={styles.tableCell}>
                        <strong style={{ textTransform: 'uppercase' }}>
                          {ev.provider}
                        </strong>
                      </td>
                      <td className={styles.tableCell}>{ev.feature}</td>
                      <td className={styles.tableCell}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {ev.model}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        <span
                          className={`${styles.badge} ${
                            ev.costType === 'actual'
                              ? styles.badgeSuccess
                              : styles.badgeInfo
                          }`}
                        >
                          {ev.costType === 'estimated'
                            ? 'Estimated (Gemini)'
                            : 'Actual (FASHN)'}
                        </span>
                      </td>
                      <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                        {ev.inputTokens !== null
                          ? `${ev.inputTokens.toLocaleString('id-ID')} / ${(
                              ev.outputTokens ?? 0
                            ).toLocaleString('id-ID')}`
                          : 'Per-render'}
                      </td>
                      <td
                        className={`${styles.tableCell} ${styles.tabularNums}`}
                        style={{ fontWeight: 600 }}
                      >
                        {formatIdr(ev.amountIdr)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className={styles.tableCell}
                      style={{ textAlign: 'center', color: '#64748B', padding: '2rem 1rem' }}
                    >
                      Tidak ada data event biaya yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
