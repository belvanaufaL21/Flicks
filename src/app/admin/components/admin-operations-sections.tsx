'use client';

import React, { useMemo, useState } from 'react';
import styles from '../admin.module.css';
import { formatDateTime, formatIdr } from '../admin-formatters';
import type {
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
} from '@/server/admin/admin.service';

export interface AdminTransactionsSectionProps {
  transactions: AdminTransactionItem[];
  tokens: AdminTokenItem[];
}

export interface AdminJobsSectionProps {
  jobs: AdminJobItem[];
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
    case 'expired':
    case 'paused':
      return styles.badgeDanger;
    case 'available':
    case 'reserved':
      return styles.badgeInfo;
    default:
      return '';
  }
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

// ==========================================================================
// 1. AdminTransactionsSection
// ==========================================================================
export function AdminTransactionsSection({
  transactions,
  tokens,
}: AdminTransactionsSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const [viewMode, setViewMode] = useState<'all' | 'transactions' | 'tokens'>('all');

  const filteredTransactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter !== 'all' && tx.status.toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = `${tx.providerReference} ${tx.paymentId} ${tx.status} ${
        tx.token?.id ?? ''
      } ${tx.token?.status ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [transactions, searchTerm, statusFilter]);

  const filteredTokens = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tokens.filter((tok) => {
      if (!q) return true;
      const haystack = `${tok.id} ${tok.status} ${tok.paymentId ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [tokens, searchTerm]);

  return (
    <section aria-label="Transactions and Tokens Management">
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Cari Order Ref, Payment ID, atau Token ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            spellCheck={false}
            aria-label="Cari transaksi dan token"
          />

          <div className={styles.chipGroup} role="group" aria-label="Filter status transaksi">
            {(
              [
                { key: 'all', label: 'Semua Status' },
                { key: 'paid', label: 'Paid' },
                { key: 'pending', label: 'Pending' },
                { key: 'failed', label: 'Failed' },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={statusFilter === s.key}
                className={`${styles.chip} ${
                  statusFilter === s.key ? styles.chipActive : ''
                }`}
                onClick={() => setStatusFilter(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className={styles.chipGroup} role="group" aria-label="Filter tampilan tabel">
            {(
              [
                { key: 'all', label: 'Semua Tabel' },
                { key: 'transactions', label: 'Transaksi Pembayaran' },
                { key: 'tokens', label: 'Token Akses' },
              ] as const
            ).map((vm) => (
              <button
                key={vm.key}
                type="button"
                aria-pressed={viewMode === vm.key}
                className={`${styles.chip} ${
                  viewMode === vm.key ? styles.chipActive : ''
                }`}
                onClick={() => setViewMode(vm.key)}
              >
                {vm.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Transactions Table */}
      {viewMode === 'all' || viewMode === 'transactions' ? (
        <div className={styles.card} style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Payment Transactions</h3>
              <p className={styles.cardSubtitle}>
                Daftar pesanan Midtrans Snap QRIS / GoPay dan korelasi token analisis
              </p>
            </div>
            <span className={styles.badge}>
              {filteredTransactions.length} Transaksi
            </span>
          </div>

          <table className={styles.dataTable} aria-label="Tabel Transaksi Pembayaran">
            <thead>
              <tr>
                <th scope="col" className={styles.tableHeaderCell}>Order Reference</th>
                <th scope="col" className={styles.tableHeaderCell}>Payment ID</th>
                <th scope="col" className={styles.tableHeaderCell}>Jumlah</th>
                <th scope="col" className={styles.tableHeaderCell}>Status Bayar</th>
                <th scope="col" className={styles.tableHeaderCell}>Waktu Bayar</th>
                <th scope="col" className={styles.tableHeaderCell}>Token Terkait</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <tr key={tx.paymentId}>
                    <td className={styles.tableCell}>
                      <strong
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--admin-ink)',
                        }}
                      >
                        {tx.providerReference}
                      </strong>
                    </td>
                    <td
                      className={styles.tableCell}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.8rem',
                        color: '#64748B',
                      }}
                    >
                      {tx.paymentId}
                    </td>
                    <td
                      className={`${styles.tableCell} ${styles.tabularNums}`}
                      style={{ fontWeight: 600 }}
                    >
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
                      {tx.paidAt ? formatDateTime(tx.paidAt) : '—'}
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
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
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
                    Tidak ada transaksi yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Issued Tokens Table */}
      {viewMode === 'all' || viewMode === 'tokens' ? (
        <div className={styles.card} style={{ overflowX: 'auto' }}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Issued Access Tokens</h3>
              <p className={styles.cardSubtitle}>
                Status siklus hidup token (available, reserved, consumed, expired)
              </p>
            </div>
            <span className={styles.badge}>{filteredTokens.length} Token</span>
          </div>

          <table className={styles.dataTable} aria-label="Tabel Token Akses">
            <thead>
              <tr>
                <th scope="col" className={styles.tableHeaderCell}>Token ID</th>
                <th scope="col" className={styles.tableHeaderCell}>Status</th>
                <th scope="col" className={styles.tableHeaderCell}>Payment ID</th>
                <th scope="col" className={styles.tableHeaderCell}>Reserved At</th>
                <th scope="col" className={styles.tableHeaderCell}>Consumed At</th>
                <th scope="col" className={styles.tableHeaderCell}>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {filteredTokens.length > 0 ? (
                filteredTokens.map((tok) => (
                  <tr key={tok.id}>
                    <td
                      className={styles.tableCell}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                      }}
                    >
                      {tok.id}
                    </td>
                    <td className={styles.tableCell}>
                      <span
                        className={`${styles.badge} ${getStatusBadgeClass(
                          tok.status,
                        )}`}
                      >
                        {tok.status}
                      </span>
                    </td>
                    <td
                      className={styles.tableCell}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.8rem',
                        color: '#64748B',
                      }}
                    >
                      {tok.paymentId ?? '—'}
                    </td>
                    <td className={styles.tableCell}>
                      {tok.reservedAt ? formatDateTime(tok.reservedAt) : '—'}
                    </td>
                    <td className={styles.tableCell}>
                      {tok.consumedAt ? formatDateTime(tok.consumedAt) : '—'}
                    </td>
                    <td className={styles.tableCell}>
                      {formatDateTime(tok.createdAt)}
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
                    Tidak ada data token yang sesuai dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// ==========================================================================
// 2. AdminJobsSection
// ==========================================================================
export function AdminJobsSection({ jobs }: AdminJobsSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'gemini' | 'fashn'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'processing'>('all');

  const filteredJobs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (providerFilter !== 'all' && job.provider.toLowerCase() !== providerFilter) {
        return false;
      }
      if (statusFilter !== 'all' && job.status.toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = `${job.id} ${job.type} ${job.provider} ${
        job.providerReference ?? ''
      } ${job.tokenId} ${job.status} ${job.error ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [jobs, searchTerm, providerFilter, statusFilter]);

  return (
    <section aria-label="AI and VTO Jobs Monitoring">
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Cari Job ID, Provider Ref, Token ID, atau Error…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            spellCheck={false}
            aria-label="Cari AI dan VTO jobs"
          />

          <div className={styles.chipGroup} role="group" aria-label="Filter provider AI">
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
                aria-pressed={providerFilter === p.key}
                className={`${styles.chip} ${
                  providerFilter === p.key ? styles.chipActive : ''
                }`}
                onClick={() => setProviderFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={styles.chipGroup} role="group" aria-label="Filter status job">
            {(
              [
                { key: 'all', label: 'Semua Status' },
                { key: 'completed', label: 'Completed' },
                { key: 'failed', label: 'Failed' },
                { key: 'processing', label: 'Processing' },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={statusFilter === s.key}
                className={`${styles.chip} ${
                  statusFilter === s.key ? styles.chipActive : ''
                }`}
                onClick={() => setStatusFilter(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className={styles.card} style={{ overflowX: 'auto' }}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>AI &amp; VTO Jobs</h3>
            <p className={styles.cardSubtitle}>
              Pemantauan performa inferensi Gemini dan generasi visual FASHN
            </p>
          </div>
          <span className={styles.badge}>{filteredJobs.length} Jobs</span>
        </div>

        <table className={styles.dataTable} aria-label="Tabel Job Monitoring">
          <thead>
            <tr>
              <th scope="col" className={styles.tableHeaderCell}>Job ID</th>
              <th scope="col" className={styles.tableHeaderCell}>Tipe / Provider</th>
              <th scope="col" className={styles.tableHeaderCell}>Provider Ref</th>
              <th scope="col" className={styles.tableHeaderCell}>Status</th>
              <th scope="col" className={styles.tableHeaderCell}>Percobaan</th>
              <th scope="col" className={styles.tableHeaderCell}>Token Recovery</th>
              <th scope="col" className={styles.tableHeaderCell}>Durasi</th>
              <th scope="col" className={styles.tableHeaderCell}>Error / Info</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length > 0 ? (
              filteredJobs.map((job) => (
                <tr key={job.id}>
                  <td
                    className={styles.tableCell}
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 600,
                    }}
                  >
                    #{job.id.slice(0, 10)}
                  </td>
                  <td className={styles.tableCell}>
                    <span style={{ fontWeight: 600 }}>{job.type}</span> (
                    {job.provider})
                  </td>
                  <td
                    className={styles.tableCell}
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.8rem',
                      color: '#64748B',
                    }}
                  >
                    {job.providerReference ?? '—'}
                  </td>
                  <td className={styles.tableCell}>
                    <span
                      className={`${styles.badge} ${getStatusBadgeClass(
                        job.status,
                      )}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td
                    className={`${styles.tableCell} ${styles.tabularNums}`}
                    style={{ textAlign: 'center' }}
                  >
                    {job.attemptCount}
                  </td>
                  <td className={styles.tableCell}>
                    <span
                      className={`${styles.badge} ${
                        job.tokenRecoveryStatus === 'recovered'
                          ? styles.badgeSuccess
                          : styles.badgeInfo
                      }`}
                    >
                      {job.tokenRecoveryStatus}
                    </span>
                  </td>
                  <td className={`${styles.tableCell} ${styles.tabularNums}`}>
                    {formatDurationMs(job.durationMs)}
                  </td>
                  <td
                    className={styles.tableCell}
                    style={{
                      maxWidth: '260px',
                      color: job.error ? 'var(--admin-danger)' : '#64748B',
                      fontSize: '0.8rem',
                    }}
                  >
                    {job.error ?? '—'}
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
                  Tidak ada job yang sesuai dengan kriteria filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
