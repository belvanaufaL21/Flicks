'use client';

import React, { useState } from 'react';
import styles from './admin.module.css';
import { AdminOverviewSection } from './components/admin-overview-section';
import { AdminFinancialsSection } from './components/admin-financials-section';
import {
  AdminJobsSection,
  AdminTransactionsSection,
} from './components/admin-operations-sections';
import { ProductCatalogSection } from './components/product-catalog-section';
import { AdminConfirmDialog } from './components/admin-confirm-dialog';
import {
  IconLayoutDashboard,
  IconTrendingUp,
  IconCreditCard,
  IconZap,
  IconShoppingBag,
  IconRefresh,
  IconMenu,
  IconX,
  IconLogOut,
} from './components/admin-icons';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
  CatalogProductRecord,
  CreateProductInput,
  UpdateProductInput,
} from '@/server/admin/admin.service';
import type {
  AdminTabKey,
  KillSwitchViewState,
} from './admin-formatters';

export type { AdminTabKey, KillSwitchViewState };

export type AdminSidebarSection =
  | 'overview'
  | 'financials'
  | 'transactions'
  | 'jobs'
  | 'products';

export interface AdminDashboardViewProps {
  summary: AdminDashboardSummary;
  transactions: AdminTransactionItem[];
  tokens: AdminTokenItem[];
  jobs: AdminJobItem[];
  products: CatalogProductRecord[];
  killSwitch?: KillSwitchViewState;
  onToggleKillSwitch?: (
    nextPaused: boolean,
    reason?: string,
  ) => void | Promise<void>;
  onCleanupExpiredPhotos?: () => Promise<{ deletedCount: number; mode: string } | void> | void;
  onRefresh?: () => void | Promise<void>;
  onSignOut?: () => void | Promise<void>;
  onCreateProduct?: (input: CreateProductInput) => void | Promise<void>;
  onUpdateProduct?: (
    productId: string,
    patch: UpdateProductInput,
  ) => void | Promise<void>;
  onDeleteProduct?: (productId: string) => void | Promise<void>;
  onDeactivateProduct?: (productId: string) => void | Promise<void>;
  onUploadPhoto?: (
    file: File,
  ) => Promise<{ imagePath: string; previewUrl: string }>;
}

const SIDEBAR_ITEMS: Array<{
  id: AdminSidebarSection;
  label: string;
  badge?: (props: AdminDashboardViewProps) => number | string | null;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', Icon: IconLayoutDashboard },
  { id: 'financials', label: 'Financials & Costs', Icon: IconTrendingUp },
  {
    id: 'transactions',
    label: 'Transactions & Tokens',
    Icon: IconCreditCard,
    badge: (p) => p.transactions.length || null,
  },
  {
    id: 'jobs',
    label: 'AI & VTO Jobs',
    Icon: IconZap,
    badge: (p) => {
      const runningOrPending = p.jobs.filter(
        (j) => j.status === 'processing' || j.status === 'queued' || j.status === 'pending',
      ).length;
      return runningOrPending > 0 ? runningOrPending : null;
    },
  },
  {
    id: 'products',
    label: 'Product Catalog',
    Icon: IconShoppingBag,
    badge: (p) => p.products.length || null,
  },
];

export function AdminDashboardView({
  summary,
  transactions,
  tokens,
  jobs,
  products,
  killSwitch,
  onToggleKillSwitch,
  onCleanupExpiredPhotos,
  onRefresh,
  onSignOut,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onDeactivateProduct,
  onUploadPhoto,
}: AdminDashboardViewProps) {
  const [activeSection, setActiveSection] = useState<AdminSidebarSection>('overview');
  const [isKillSwitchConfirmOpen, setIsKillSwitchConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    if (!onSignOut || isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const isPaused = Boolean(killSwitch?.paidWorkPaused);

  return (
    <div className={styles.adminShell}>
      {/* Mobile Backdrop */}
      {isMobileNavOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. Dark SaaS Sidebar */}
      <aside
        className={`${styles.sidebar} ${isMobileNavOpen ? styles.sidebarOpen : ''}`}
        aria-label="Navigasi Utama Admin"
      >
        <div className={styles.sidebarBrand}>
          <div className={styles.sidebarBrandLogo}>F</div>
          <div>
            <div className={styles.sidebarBrandName}>FLICKS Admin</div>
            <div className={styles.sidebarBrandBadge}>Management Console</div>
          </div>
        </div>

        <nav className={styles.sidebarNav} role="tablist" aria-label="Menu Admin">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const badgeValue = item.badge?.({
              summary,
              transactions,
              tokens,
              jobs,
              products,
              killSwitch,
            });

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.sidebarNavItem} ${isActive ? styles.sidebarNavItemActive : ''}`}
                onClick={() => {
                  setActiveSection(item.id);
                  setIsMobileNavOpen(false);
                }}
              >
                <span className={styles.sidebarNavIcon} aria-hidden="true">
                  <item.Icon size={18} />
                </span>
                <span className={styles.sidebarNavLabel}>{item.label}</span>
                {badgeValue !== null && badgeValue !== undefined ? (
                  <span className={styles.sidebarNavBadge}>{badgeValue}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>AD</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>Administrator</span>
              <span className={styles.userRole}>Superadmin</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.signOutButton}
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Keluar dari akun admin"
          >
            <IconLogOut size={14} />
            <span>{isSigningOut ? 'Keluar...' : 'Keluar'}</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className={styles.mainWrapper}>
        {/* Sticky Topbar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.topbarHamburger}
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              aria-label={isMobileNavOpen ? 'Tutup navigasi menu' : 'Buka navigasi menu'}
              aria-expanded={isMobileNavOpen}
            >
              {isMobileNavOpen ? <IconX size={18} /> : <IconMenu size={18} />}
            </button>
            <div className={styles.topbarTitleGroup}>
              <h1 className={styles.topbarTitle}>
                {activeSection === 'overview' && 'Command Center Overview'}
                {activeSection === 'financials' && 'Financials & Cost Analysis'}
                {activeSection === 'transactions' && 'Transactions & Token Ledgers'}
                {activeSection === 'jobs' && 'AI Analysis & VTO Jobs'}
                {activeSection === 'products' && 'Product Catalog Management'}
              </h1>
              <p className={styles.topbarSubtitle}>
                {activeSection === 'overview' && 'Status sistem, alert, ringkasan transaksi & aksi cepat operasional.'}
                {activeSection === 'financials' && 'Margin kotor, biaya API Fashn & Gemini, dan breakdown per sesi.'}
                {activeSection === 'transactions' && 'Daftar riwayat pembayaran pengguna dan alokasi kredit token.'}
                {activeSection === 'jobs' && 'Pemantauan status antrean, durasi, latency, dan histori error pipeline AI.'}
                {activeSection === 'products' && 'Kelola katalog kurasi, spesifikasi outfit, dan aktivasi model VTO.'}
              </p>
            </div>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.statusIndicator}>
              <span
                className={`${styles.statusDot} ${
                  isPaused ? styles.statusDotPaused : styles.statusDotActive
                }`}
                aria-hidden="true"
              />
              <span className={styles.statusText}>
                {isPaused ? 'AI Paused' : 'System Healthy'}
              </span>
            </div>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Segarkan data dashboard"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <IconRefresh size={14} className={isRefreshing ? styles.spinning : ''} />
              <span>{isRefreshing ? 'Memuat...' : 'Segarkan Data'}</span>
            </button>
          </div>
        </header>

        {/* Dynamic Section Outlet */}
        <main className={styles.mainCanvas}>
          {activeSection === 'overview' && (
            <AdminOverviewSection
              summary={summary}
              transactions={transactions}
              jobs={jobs}
              tokens={tokens}
              killSwitch={killSwitch}
              onNavigate={(tab) => {
                if (tab === 'financials' || tab === 'costs') {
                  setActiveSection('financials');
                } else if (tab === 'transactions') {
                  setActiveSection('transactions');
                } else if (tab === 'jobs') {
                  setActiveSection('jobs');
                } else if (tab === 'products') {
                  setActiveSection('products');
                } else {
                  setActiveSection('overview');
                }
              }}
              onRequestPauseKillSwitch={() => setIsKillSwitchConfirmOpen(true)}
              onResumeKillSwitch={() => void onToggleKillSwitch?.(false)}
              onTriggerCleanup={onCleanupExpiredPhotos}
            />
          )}

          {activeSection === 'financials' && (
            <AdminFinancialsSection
              summary={summary}
              transactions={transactions}
              jobs={jobs}
            />
          )}

          {activeSection === 'transactions' && (
            <AdminTransactionsSection
              transactions={transactions}
              tokens={tokens}
            />
          )}

          {activeSection === 'jobs' && (
            <AdminJobsSection jobs={jobs} />
          )}

          {activeSection === 'products' && (
            <ProductCatalogSection
              products={products}
              onCreateProduct={onCreateProduct}
              onUpdateProduct={onUpdateProduct}
              onDeleteProduct={onDeleteProduct}
              onDeactivateProduct={onDeactivateProduct}
              onUploadPhoto={onUploadPhoto}
            />
          )}
        </main>
      </div>

      {/* Global Confirmation Modal for Kill Switch */}
      {isKillSwitchConfirmOpen && (
        <AdminConfirmDialog
          title="Jeda Operasional AI Berbayar?"
          description="Tindakan ini akan menghentikan seluruh pemrosesan AI berbayar (analisis Gemini & VTO Fashn) untuk mencegah lonjakan biaya API tak terduga. Token pengguna tidak akan terpotong saat AI dijeda."
          confirmLabel="Ya, Jeda AI Berbayar"
          cancelLabel="Batal"
          tone="danger"
          onConfirm={async () => {
            await onToggleKillSwitch?.(true, 'Admin paused via dashboard');
            setIsKillSwitchConfirmOpen(false);
          }}
          onCancel={() => setIsKillSwitchConfirmOpen(false)}
        />
      )}
    </div>
  );
}
