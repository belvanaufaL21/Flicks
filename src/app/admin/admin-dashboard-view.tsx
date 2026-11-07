'use client';

import React, { useMemo, useState } from 'react';
import styles from './admin.module.css';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
  AdminUsageCostItem,
  CatalogProductRecord,
  CreateProductInput,
  ProductGender,
  UpdateProductInput,
} from '@/server/admin/admin.service';
import type { PrimarySeason } from '@/server/analysis/schemas';
import {
  BODY_SHAPE_LABELS,
  FEMALE_BODY_SHAPES,
  MALE_BODY_SHAPES,
  type BodyShapeCategory,
} from '@/shared/body-shape-labels';

export type AdminTabKey =
  | 'summary'
  | 'transactions'
  | 'jobs'
  | 'products'
  | 'costs'
  | 'financials';

export type FinancialPeriodFilter = 'all' | 'today' | '7days' | 'thisMonth';

export interface KillSwitchViewState {
  paidWorkPaused: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface AdminDashboardViewProps {
  summary: AdminDashboardSummary;
  transactions: AdminTransactionItem[];
  tokens: AdminTokenItem[];
  jobs: AdminJobItem[];
  products: CatalogProductRecord[];
  killSwitch?: KillSwitchViewState;
  onToggleKillSwitch?: (nextPaused: boolean) => void | Promise<void>;
  onCleanupExpiredPhotos?: () =>
    | { deletedCount: number; failedCount: number }
    | void
    | Promise<{ deletedCount: number; failedCount: number } | void>;
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

const COLOR_TONE_OPTIONS: Array<{ key: PrimarySeason; label: string }> = [
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'autumn', label: 'Autumn' },
  { key: 'winter', label: 'Winter' },
];

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'All Size'] as const;

function isBottomsCategory(rawCategory: string | null | undefined): boolean {
  if (!rawCategory) return false;
  const c = rawCategory.trim().toLowerCase();
  return [
    'bottoms',
    'skirt',
    'shorts',
    'pants',
    'bottom',
    'trousers',
    'bawahan',
    'rok',
    'celana pendek',
  ].includes(c);
}

// ponytail: static category list with explicit user-side tops/bottoms grouping
const PRODUCT_CATEGORY_OPTIONS = [
  {
    value: 'tops',
    label: 'Atasan / Tops (Kaos, Blouse, Sweater)',
    group: 'tops',
  },
  { value: 'shirt', label: 'Kemeja / Shirt', group: 'tops' },
  {
    value: 'outerwear',
    label: 'Luaran / Outerwear (Jaket, Blazer, Cardigan)',
    group: 'tops',
  },
  {
    value: 'one-pieces',
    label: 'Terusan / One-Pieces (Jumpsuit, Gamis, Set)',
    group: 'tops',
  },
  { value: 'dress', label: 'Gaun / Dress', group: 'tops' },
  {
    value: 'bottoms',
    label: 'Bawahan / Bottoms (Celana Panjang, Jeans, Chino)',
    group: 'bottoms',
  },
  { value: 'skirt', label: 'Rok / Skirt', group: 'bottoms' },
  { value: 'shorts', label: 'Celana Pendek / Shorts', group: 'bottoms' },
] as const;

function getBodyShapesForGender(gender: ProductGender): BodyShapeCategory[] {
  const maleShapes = MALE_BODY_SHAPES.filter((s) => s !== 'unknown');
  const femaleShapes = FEMALE_BODY_SHAPES.filter((s) => s !== 'unknown');
  if (gender === 'male') return maleShapes;
  if (gender === 'female') return femaleShapes;
  return Array.from(new Set([...maleShapes, ...femaleShapes]));
}

function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}

export function AdminDashboardView({
  summary,
  transactions,
  tokens,
  jobs,
  products,
  killSwitch,
  onToggleKillSwitch,
  onCleanupExpiredPhotos,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onDeactivateProduct,
  onUploadPhoto,
}: AdminDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('summary');
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);
  const [financialPeriod, setFinancialPeriod] =
    useState<FinancialPeriodFilter>('all');
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('tops');
  const [newImagePath, setNewImagePath] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [gender, setGender] = useState<ProductGender>('unisex');
  const [selectedBodyShapes, setSelectedBodyShapes] = useState<
    BodyShapeCategory[]
  >([]);
  const [selectedColorTones, setSelectedColorTones] = useState<
    PrimarySeason[]
  >([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editingProduct, setEditingProduct] =
    useState<CatalogProductRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCategory, setEditCategory] = useState('tops');
  const [editImagePath, setEditImagePath] = useState('');
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editSourceUrl, setEditSourceUrl] = useState('');
  const [editGender, setEditGender] = useState<ProductGender>('unisex');
  const [editBodyShapes, setEditBodyShapes] = useState<BodyShapeCategory[]>([]);
  const [editColorTones, setEditColorTones] = useState<PrimarySeason[]>([]);
  const [editSizes, setEditSizes] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);

  const availableBodyShapes = useMemo(
    () => getBodyShapesForGender(gender),
    [gender],
  );

  const availableEditBodyShapes = useMemo(
    () => getBodyShapesForGender(editGender),
    [editGender],
  );

  // ponytail: client-side period filter & ledger join over in-memory props; move to server query when paid transactions > 5,000
  const filteredTransactions = useMemo(() => {
    const paidTx = transactions.filter((t) => t.status === 'paid');
    if (financialPeriod === 'all') return paidTx;

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).getTime();

    return paidTx.filter((t) => {
      const timestamp = Date.parse(t.paidAt || t.createdAt);
      if (Number.isNaN(timestamp)) return true;
      if (financialPeriod === 'today') return timestamp >= startOfToday;
      if (financialPeriod === '7days') return timestamp >= sevenDaysAgo;
      if (financialPeriod === 'thisMonth') return timestamp >= startOfMonth;
      return true;
    });
  }, [transactions, financialPeriod]);

  const financialLedgerEntries = useMemo(() => {
    const jobsByTokenId = new Map<string, AdminJobItem[]>();
    for (const job of jobs) {
      const list = jobsByTokenId.get(job.tokenId) ?? [];
      list.push(job);
      jobsByTokenId.set(job.tokenId, list);
    }

    const eventsByJobId = new Map<string, AdminUsageCostItem[]>();
    for (const ev of summary.costs.events) {
      const list = eventsByJobId.get(ev.jobId) ?? [];
      list.push(ev);
      eventsByJobId.set(ev.jobId, list);
    }

    return filteredTransactions.map((tx) => {
      const revenueIdr = tx.amount;
      const midtransFeeIdr = Math.round(revenueIdr * 0.007);
      const tokenId = tx.token?.id;
      const linkedJobs = tokenId ? jobsByTokenId.get(tokenId) ?? [] : [];
      let geminiCostIdr = 0;
      let fashnCostIdr = 0;

      for (const job of linkedJobs) {
        const events = eventsByJobId.get(job.id) ?? [];
        for (const ev of events) {
          if (ev.provider === 'gemini') {
            geminiCostIdr += ev.amountIdr;
          } else if (ev.provider === 'fashn') {
            fashnCostIdr += ev.amountIdr;
          }
        }
      }

      const totalCogsIdr = midtransFeeIdr + geminiCostIdr + fashnCostIdr;
      const grossProfitIdr = revenueIdr - totalCogsIdr;
      const grossMarginPercent =
        revenueIdr > 0 ? Math.round((grossProfitIdr / revenueIdr) * 100) : 0;

      return {
        paymentId: tx.paymentId,
        orderReference: tx.providerReference,
        paidAt: tx.paidAt ?? tx.createdAt,
        revenueIdr,
        midtransFeeIdr,
        geminiCostIdr,
        fashnCostIdr,
        totalCogsIdr,
        grossProfitIdr,
        grossMarginPercent,
      };
    });
  }, [filteredTransactions, jobs, summary.costs.events]);

  const filteredFinancialKpis = useMemo(() => {
    const paidCount = financialLedgerEntries.length;
    const grossRevenueIdr = financialLedgerEntries.reduce(
      (acc, item) => acc + item.revenueIdr,
      0,
    );
    const midtransFeeIdr = financialLedgerEntries.reduce(
      (acc, item) => acc + item.midtransFeeIdr,
      0,
    );
    const geminiCostIdr = financialLedgerEntries.reduce(
      (acc, item) => acc + item.geminiCostIdr,
      0,
    );
    const fashnCostIdr = financialLedgerEntries.reduce(
      (acc, item) => acc + item.fashnCostIdr,
      0,
    );
    const totalCogsIdr = midtransFeeIdr + geminiCostIdr + fashnCostIdr;
    const grossProfitIdr = grossRevenueIdr - totalCogsIdr;
    const grossMarginPercent =
      grossRevenueIdr > 0
        ? Math.round((grossProfitIdr / grossRevenueIdr) * 100)
        : 0;
    const avgProfitPerUserIdr =
      paidCount > 0 ? Math.round(grossProfitIdr / paidCount) : 0;
    const avgCogsPerUserIdr =
      paidCount > 0 ? Math.round(totalCogsIdr / paidCount) : 0;

    return {
      paidCount,
      grossRevenueIdr,
      midtransFeeIdr,
      geminiCostIdr,
      fashnCostIdr,
      totalCogsIdr,
      grossProfitIdr,
      grossMarginPercent,
      avgProfitPerUserIdr,
      avgCogsPerUserIdr,
    };
  }, [financialLedgerEntries]);

  function exportFinancialsCsv() {
    const headers = [
      'Order Reference',
      'Paid At',
      'Gross Revenue (IDR)',
      'Midtrans Fee 0.7% (IDR)',
      'Gemini Cost (IDR)',
      'FASHN Cost (IDR)',
      'Total COGS (IDR)',
      'Gross Profit (IDR)',
      'Gross Margin (%)',
    ];

    const rows = financialLedgerEntries.map((entry) => [
      sanitizeCsvCell(entry.orderReference),
      sanitizeCsvCell(entry.paidAt),
      entry.revenueIdr,
      entry.midtransFeeIdr,
      entry.geminiCostIdr,
      entry.fashnCostIdr,
      entry.totalCogsIdr,
      entry.grossProfitIdr,
      `${entry.grossMarginPercent}%`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const nowStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute(
      'download',
      `flicks-financials-${financialPeriod}-${nowStr}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const openEditModal = (prod: CatalogProductRecord) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    setEditBrand(prod.brand ?? '');
    setEditCategory(prod.category || 'tops');
    setEditImagePath(prod.imagePath);
    setEditPreviewUrl(
      typeof prod.labels?.preview_url === 'string'
        ? prod.labels.preview_url
        : prod.imagePath,
    );
    setEditSourceUrl(prod.sourceUrl ?? '');
    setEditGender(
      (prod.labels?.gender as ProductGender | undefined) ?? 'unisex',
    );
    setEditBodyShapes(
      Array.isArray(prod.labels?.body_shapes)
        ? (prod.labels.body_shapes as BodyShapeCategory[])
        : [],
    );
    setEditColorTones(
      Array.isArray(prod.labels?.color_tones)
        ? (prod.labels.color_tones as PrimarySeason[])
        : [],
    );
    setEditSizes(
      Array.isArray(prod.labels?.sizes) ? prod.labels.sizes : [],
    );
    setEditIsActive(prod.isActive);
  };

  const handleEditGenderChange = (nextGender: ProductGender) => {
    setEditGender(nextGender);
    const allowed = new Set(getBodyShapesForGender(nextGender));
    setEditBodyShapes((prev) => prev.filter((shape) => allowed.has(shape)));
  };

  const handleEditPhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (onUploadPhoto) {
      const result = await onUploadPhoto(file);
      setEditImagePath(result.imagePath);
      setEditPreviewUrl(result.previewUrl);
      return;
    }
    setEditImagePath(`/uploads/products/${file.name}`);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (onUpdateProduct) {
      await onUpdateProduct(editingProduct.id, {
        name: editName,
        brand: editBrand || null,
        category: editCategory,
        imagePath: editImagePath,
        sourceUrl: editSourceUrl || null,
        isActive: editIsActive,
        labels: {
          gender: editGender,
          body_shapes: editBodyShapes,
          color_tones: editColorTones,
          sizes: editSizes,
          ...(editPreviewUrl ? { preview_url: editPreviewUrl } : {}),
        },
      });
    }
    setEditingProduct(null);
  };

  const handleGenderChange = (nextGender: ProductGender) => {
    setGender(nextGender);
    const allowed = new Set(getBodyShapesForGender(nextGender));
    setSelectedBodyShapes((prev) => prev.filter((shape) => allowed.has(shape)));
  };

  const toggleBodyShape = (shape: BodyShapeCategory) => {
    setSelectedBodyShapes((prev) =>
      prev.includes(shape)
        ? prev.filter((item) => item !== shape)
        : [...prev, shape],
    );
  };

  const toggleColorTone = (tone: PrimarySeason) => {
    setSelectedColorTones((prev) =>
      prev.includes(tone)
        ? prev.filter((item) => item !== tone)
        : [...prev, tone],
    );
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size)
        ? prev.filter((item) => item !== size)
        : [...prev, size],
    );
  };

  const handlePhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadedFileName(file.name);

    if (onUploadPhoto) {
      setIsUploading(true);
      try {
        const result = await onUploadPhoto(file);
        setNewImagePath(result.imagePath);
        setPreviewUrl(result.previewUrl);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Gagal mengunggah foto produk.',
        );
      } finally {
        setIsUploading(false);
      }
      return;
    }

    setNewImagePath(`/uploads/products/${file.name}`);
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleResetPhoto = () => {
    setUploadedFileName(null);
    setPreviewUrl(null);
    setNewImagePath('');
    setUploadError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateProduct) return;
    await onCreateProduct({
      name: newName,
      brand: newBrand || null,
      category: newCategory,
      subcategory: null,
      imagePath: newImagePath || '/uploads/products/placeholder.jpg',
      sourceUrl: newSourceUrl || null,
      labels: {
        gender,
        body_shapes: selectedBodyShapes,
        color_tones: selectedColorTones,
        sizes: selectedSizes,
        ...(previewUrl ? { preview_url: previewUrl } : {}),
      },
    });
    setNewName('');
    setNewBrand('');
    setNewCategory('tops');
    setNewImagePath('');
    setNewSourceUrl('');
    setGender('unisex');
    setSelectedBodyShapes([]);
    setSelectedColorTones([]);
    setSelectedSizes([]);
    setUploadedFileName(null);
    setPreviewUrl(null);
    setUploadError(null);
  };

  return (
    <main className={styles.adminShell}>
      <div className={styles.adminContainer}>
        <header className={styles.headerBar}>
          <div>
            <h1 className={styles.headerTitle}>Flicks Operations &amp; Admin</h1>
            <p className={styles.headerSubtitle}>
              Transactions, Token Lifecycle, AI/VTO Jobs, Product Catalog &amp;
              Usage Costs
            </p>
          </div>

          <div
            role="region"
            aria-label="Operator System Controls"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {killSwitch ? (
              <>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    padding: '0.35rem 0.7rem',
                    borderRadius: '999px',
                    background: killSwitch.paidWorkPaused
                      ? '#fee2e2'
                      : '#dcfce7',
                    color: killSwitch.paidWorkPaused ? '#991b1b' : '#166534',
                  }}
                >
                  {killSwitch.paidWorkPaused
                    ? 'AI Engine: Paused'
                    : 'AI Engine: Active'}
                </span>
                {onToggleKillSwitch ? (
                  <button
                    type="button"
                    className={styles.tabButton}
                    style={{
                      background: killSwitch.paidWorkPaused
                        ? '#16a34a'
                        : '#dc2626',
                      color: '#ffffff',
                      borderColor: killSwitch.paidWorkPaused
                        ? '#16a34a'
                        : '#dc2626',
                    }}
                    onClick={() =>
                      void onToggleKillSwitch(!killSwitch.paidWorkPaused)
                    }
                  >
                    {killSwitch.paidWorkPaused
                      ? 'Resume Paid AI Work'
                      : 'Pause Paid AI Work'}
                  </button>
                ) : null}
              </>
            ) : null}

            {onCleanupExpiredPhotos ? (
              <button
                type="button"
                className={styles.tabButton}
                onClick={async () => {
                  const res = await onCleanupExpiredPhotos();
                  if (res && typeof res.deletedCount === 'number') {
                    setCleanupNotice(
                      `Cleaned ${res.deletedCount} expired photo(s)`,
                    );
                  }
                }}
              >
                Cleanup Expired Photos (&gt;72h)
              </button>
            ) : null}
            {cleanupNotice ? (
              <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                {cleanupNotice}
              </span>
            ) : null}
          </div>
        </header>

        <nav className={styles.tabBar} role="tablist" aria-label="Admin sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'summary'}
            className={`${styles.tabButton} ${
              activeTab === 'summary' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transactions'}
            className={`${styles.tabButton} ${
              activeTab === 'transactions' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions &amp; Tokens
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'jobs'}
            className={`${styles.tabButton} ${
              activeTab === 'jobs' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('jobs')}
          >
            AI &amp; VTO Jobs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'products'}
            className={`${styles.tabButton} ${
              activeTab === 'products' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('products')}
          >
            Product Catalog
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'costs'}
            className={`${styles.tabButton} ${
              activeTab === 'costs' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('costs')}
          >
            Usage &amp; Costs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'financials'}
            className={`${styles.tabButton} ${
              activeTab === 'financials' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('financials')}
          >
            Financials &amp; P&amp;L
          </button>
        </nav>

        {activeTab === 'summary' ? (
          <section aria-label="Dashboard Summary">
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Total Verified Revenue</div>
                <div className={styles.metricValue}>
                  {formatIdr(summary.transactions.totalRevenueIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  {summary.transactions.paidCount} paid /{' '}
                  {summary.transactions.totalCount} total transactions
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Token Lifecycle</div>
                <div className={styles.metricValue}>
                  {summary.tokens.totalCount}
                </div>
                <div className={styles.metricSubtext}>
                  {summary.tokens.availableCount} available ·{' '}
                  {summary.tokens.reservedCount} reserved ·{' '}
                  {summary.tokens.consumedCount} consumed
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Job Success Rate</div>
                <div className={styles.metricValue}>
                  {summary.jobs.successRatePercent}%
                </div>
                <div className={styles.metricSubtext}>
                  {summary.jobs.completedCount} completed ·{' '}
                  {summary.jobs.failedCount} failed
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>
                  Provider Cost Summary
                </div>
                <div className={styles.metricValue}>
                  {formatIdr(summary.costs.totalCostIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  Estimated (Gemini): {formatIdr(summary.costs.geminiEstimatedIdr)}{' '}
                  · Actual (FASHN): {formatIdr(summary.costs.fashnActualIdr)}
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>
                  Gross Profit &amp; Margin
                </div>
                <div className={styles.metricValue}>
                  {formatIdr(summary.financials?.grossProfitIdr ?? 0)}
                </div>
                <div className={styles.metricSubtext}>
                  Margin: {summary.financials?.grossMarginPercent ?? 0}% · Midtrans
                  MDR: {formatIdr(summary.financials?.midtransFeeIdr ?? 0)}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'transactions' ? (
          <section className={styles.sectionCard} aria-label="Transactions and Tokens">
            <h2 className={styles.sectionHeading}>
              Payment Transactions &amp; Token Lifecycle
            </h2>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeaderCell}>Order Reference</th>
                  <th className={styles.tableHeaderCell}>Amount</th>
                  <th className={styles.tableHeaderCell}>Payment Status</th>
                  <th className={styles.tableHeaderCell}>Paid Timestamp</th>
                  <th className={styles.tableHeaderCell}>Token Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.paymentId}>
                    <td className={styles.tableCell}>{tx.providerReference}</td>
                    <td className={styles.tableCell}>{formatIdr(tx.amount)}</td>
                    <td className={styles.tableCell}>
                      <span className={styles.badge}>{tx.status}</span>
                    </td>
                    <td className={styles.tableCell}>{tx.paidAt ?? '—'}</td>
                    <td className={styles.tableCell}>
                      {tx.token ? (
                        <span className={styles.badge}>{tx.token.status}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {tokens.length > 0 ? (
              <div style={{ marginTop: '1.25rem' }}>
                <h3 className={styles.sectionHeading}>Issued Tokens</h3>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th className={styles.tableHeaderCell}>Token ID</th>
                      <th className={styles.tableHeaderCell}>Status</th>
                      <th className={styles.tableHeaderCell}>Reserved At</th>
                      <th className={styles.tableHeaderCell}>Consumed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((tok) => (
                      <tr key={tok.id}>
                        <td className={styles.tableCell}>{tok.id}</td>
                        <td className={styles.tableCell}>
                          <span className={styles.badge}>{tok.status}</span>
                        </td>
                        <td className={styles.tableCell}>
                          {tok.reservedAt ?? '—'}
                        </td>
                        <td className={styles.tableCell}>
                          {tok.consumedAt ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'jobs' ? (
          <section className={styles.sectionCard} aria-label="AI and VTO Jobs">
            <h2 className={styles.sectionHeading}>
              Analysis &amp; Virtual Try-On Job Monitoring
            </h2>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeaderCell}>Job ID</th>
                  <th className={styles.tableHeaderCell}>Type / Provider</th>
                  <th className={styles.tableHeaderCell}>Provider Ref</th>
                  <th className={styles.tableHeaderCell}>Status</th>
                  <th className={styles.tableHeaderCell}>Attempts</th>
                  <th className={styles.tableHeaderCell}>Token Recovery</th>
                  <th className={styles.tableHeaderCell}>Duration</th>
                  <th className={styles.tableHeaderCell}>Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className={styles.tableCell}>{job.id}</td>
                    <td className={styles.tableCell}>
                      {job.type} ({job.provider})
                    </td>
                    <td className={styles.tableCell}>
                      {job.providerReference ?? '—'}
                    </td>
                    <td className={styles.tableCell}>
                      <span className={styles.badge}>{job.status}</span>
                    </td>
                    <td className={styles.tableCell}>{job.attemptCount}</td>
                    <td className={styles.tableCell}>
                      <span className={styles.badge}>
                        {job.tokenRecoveryStatus}
                      </span>
                    </td>
                    <td className={styles.tableCell}>
                      {job.durationMs !== null ? `${job.durationMs} ms` : '—'}
                    </td>
                    <td className={styles.tableCell}>{job.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === 'products' ? (
          <section className={styles.sectionCard} aria-label="Product Catalog">
            <h2 className={styles.sectionHeading}>Catalog Management</h2>

            <form onSubmit={handleCreateSubmit} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.uploadZone}>
                <div className={styles.formField}>
                  <label htmlFor="prod-photo-upload" className={styles.formLabel}>
                    Upload Foto Produk (JPG, PNG, WebP · maks 5 MB)
                  </label>
                  <input
                    id="prod-photo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handlePhotoChange(e)}
                    className={styles.formInput}
                  />
                  {isUploading ? (
                    <span className={styles.metricSubtext}>
                      Mengunggah foto produk...
                    </span>
                  ) : null}
                  {uploadError ? (
                    <span className={styles.errorText} role="alert">
                      {uploadError}
                    </span>
                  ) : null}
                </div>

                {previewUrl || uploadedFileName ? (
                  <div className={styles.uploadPreview}>
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={uploadedFileName ?? 'Preview Foto Produk'}
                        className={styles.previewThumbnail}
                      />
                    ) : null}
                    <div className={styles.previewMeta}>
                      <span className={styles.previewFileName}>
                        {uploadedFileName ?? newImagePath}
                      </span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleResetPhoto}
                      >
                        Hapus Foto
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="prod-name" className={styles.formLabel}>
                    Product Name
                  </label>
                  <input
                    id="prod-name"
                    className={styles.formInput}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="prod-brand" className={styles.formLabel}>
                    Brand
                  </label>
                  <input
                    id="prod-brand"
                    className={styles.formInput}
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="prod-category" className={styles.formLabel}>
                    Category
                  </label>
                  <select
                    id="prod-category"
                    className={styles.formInput}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    required
                  >
                    <optgroup label="Kelompok Atasan (Tops di Pengguna)">
                      {PRODUCT_CATEGORY_OPTIONS.filter(
                        (opt) => opt.group === 'tops',
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelompok Bawahan (Bottoms di Pengguna)">
                      {PRODUCT_CATEGORY_OPTIONS.filter(
                        (opt) => opt.group === 'bottoms',
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label htmlFor="prod-source" className={styles.formLabel}>
                    Link Produk (Store URL)
                  </label>
                  <input
                    id="prod-source"
                    type="url"
                    className={styles.formInput}
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://shopee.co.id/..."
                  />
                </div>
              </div>

              <div className={styles.matchingSection}>
                <fieldset className={styles.fieldsetGroup}>
                  <legend className={styles.formLabel}>Gender Pakaian</legend>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="prod-gender"
                        value="male"
                        checked={gender === 'male'}
                        onChange={() => handleGenderChange('male')}
                      />
                      <span>Pria (Male)</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="prod-gender"
                        value="female"
                        checked={gender === 'female'}
                        onChange={() => handleGenderChange('female')}
                      />
                      <span>Wanita (Female)</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="prod-gender"
                        value="unisex"
                        checked={gender === 'unisex'}
                        onChange={() => handleGenderChange('unisex')}
                      />
                      <span>Unisex</span>
                    </label>
                  </div>
                </fieldset>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>
                    Tipe Body Shape yang Cocok
                  </span>
                  <div className={styles.chipGroup} role="group" aria-label="Body Shape">
                    {availableBodyShapes.map((shapeKey) => {
                      const active = selectedBodyShapes.includes(shapeKey);
                      return (
                        <button
                          key={shapeKey}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleBodyShape(shapeKey)}
                        >
                          {BODY_SHAPE_LABELS[shapeKey].display}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>
                    Personal Color Tone yang Cocok
                  </span>
                  <div
                    className={styles.chipGroup}
                    role="group"
                    aria-label="Personal Color Tone"
                  >
                    {COLOR_TONE_OPTIONS.map((tone) => {
                      const active = selectedColorTones.includes(tone.key);
                      return (
                        <button
                          key={tone.key}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleColorTone(tone.key)}
                        >
                          {tone.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>Ukuran Tersedia</span>
                  <div className={styles.chipGroup} role="group" aria-label="Ukuran">
                    {SIZE_OPTIONS.map((size) => {
                      const active = selectedSizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleSize(size)}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button type="submit" className={styles.primaryButton}>
                Tambah ke Katalog (Save to Catalog)
              </button>
            </form>

            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeaderCell}>Photo</th>
                  <th className={styles.tableHeaderCell}>Name &amp; Brand</th>
                  <th className={styles.tableHeaderCell}>Category</th>
                  <th className={styles.tableHeaderCell}>Gender</th>
                  <th className={styles.tableHeaderCell}>Matching Tags</th>
                  <th className={styles.tableHeaderCell}>Sizes</th>
                  <th className={styles.tableHeaderCell}>Store Link</th>
                  <th className={styles.tableHeaderCell}>Status</th>
                  <th className={styles.tableHeaderCell}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => {
                  const prodGender =
                    (prod.labels?.gender as ProductGender | undefined) ??
                    'unisex';
                  const bodyShapes = Array.isArray(prod.labels?.body_shapes)
                    ? prod.labels.body_shapes
                    : [];
                  const colorTones = Array.isArray(prod.labels?.color_tones)
                    ? prod.labels.color_tones
                    : [];
                  const sizes = Array.isArray(prod.labels?.sizes)
                    ? prod.labels.sizes
                    : [];
                  const thumbSrc =
                    typeof prod.labels?.preview_url === 'string' &&
                    prod.labels.preview_url
                      ? prod.labels.preview_url
                      : prod.imagePath;

                  const genderBadgeClass =
                    prodGender === 'male'
                      ? styles.badgeMale
                      : prodGender === 'female'
                        ? styles.badgeFemale
                        : styles.badgeUnisex;
                  const genderLabel =
                    prodGender === 'male'
                      ? 'Pria'
                      : prodGender === 'female'
                        ? 'Wanita'
                        : 'Unisex';

                  return (
                    <tr key={prod.id}>
                      <td className={styles.tableCell}>
                        <img
                          src={thumbSrc}
                          alt={prod.name}
                          className={styles.tableThumb}
                        />
                      </td>
                      <td className={styles.tableCell}>
                        <div>{prod.name}</div>
                        <div className={styles.metricSubtext}>
                          {prod.brand ?? '—'}
                        </div>
                      </td>
                      <td className={styles.tableCell}>
                        <div>{prod.category}</div>
                        <div className={styles.metricSubtext}>
                          Kelompok:{' '}
                          {isBottomsCategory(prod.category)
                            ? 'Bottoms (Bawahan)'
                            : 'Tops (Atasan)'}
                        </div>
                        {prod.subcategory ? (
                          <div className={styles.metricSubtext}>
                            {prod.subcategory}
                          </div>
                        ) : null}
                      </td>
                      <td className={styles.tableCell}>
                        <span className={`${styles.badge} ${genderBadgeClass}`}>
                          {genderLabel}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        <div className={styles.tagWrap}>
                          {bodyShapes.map((shape) => (
                            <span key={`bs-${shape}`} className={styles.tagPill}>
                              {BODY_SHAPE_LABELS[
                                shape as BodyShapeCategory
                              ]?.en ?? shape}
                            </span>
                          ))}
                          {colorTones.map((tone) => (
                            <span key={`ct-${tone}`} className={styles.tagPill}>
                              {tone}
                            </span>
                          ))}
                          {bodyShapes.length === 0 && colorTones.length === 0
                            ? '—'
                            : null}
                        </div>
                      </td>
                      <td className={styles.tableCell}>
                        {sizes.length > 0 ? sizes.join(', ') : '—'}
                      </td>
                      <td className={styles.tableCell}>
                        {prod.sourceUrl ? (
                          <a
                            href={prod.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.storeLink}
                          >
                            Lihat Produk ↗
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.tableCell}>
                        <span
                          className={`${styles.badge} ${
                            prod.isActive
                              ? styles.badgeSuccess
                              : styles.badgeDanger
                          }`}
                        >
                          {prod.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            aria-label="Edit"
                            title="Edit Produk"
                            className={`${styles.secondaryButton} ${styles.iconButton}`}
                            onClick={() => openEditModal(prod)}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
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
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          {prod.isActive && onDeactivateProduct ? (
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={() => void onDeactivateProduct(prod.id)}
                            >
                              Deactivate
                            </button>
                          ) : null}
                          <button
                            type="button"
                            aria-label="Hapus"
                            title="Hapus Produk"
                            className={`${styles.dangerButton} ${styles.iconButton}`}
                            onClick={() =>
                              void (onDeleteProduct ?? onDeactivateProduct)?.(
                                prod.id,
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
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
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {editingProduct ? (
              <div className={styles.modalOverlay}>
                <div
                  className={styles.modalCard}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="edit-product-title"
                >
                  <div className={styles.modalHeader}>
                    <h3 id="edit-product-title" className={styles.sectionHeading}>
                      Edit Produk
                    </h3>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setEditingProduct(null)}
                    >
                      Tutup
                    </button>
                  </div>
                  <form onSubmit={handleEditSubmit}>
                    <div className={styles.uploadZone}>
                      <div className={styles.formField}>
                        <label
                          htmlFor="edit-prod-photo"
                          className={styles.formLabel}
                        >
                          Ganti Foto Produk
                        </label>
                        <input
                          id="edit-prod-photo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className={styles.formInput}
                          onChange={handleEditPhotoChange}
                        />
                      </div>
                      {editPreviewUrl ? (
                        <img
                          src={editPreviewUrl}
                          alt="Preview Edit Produk"
                          className={styles.previewThumbnail}
                        />
                      ) : null}
                    </div>

                    <div className={styles.formGrid}>
                      <div className={styles.formField}>
                        <label
                          htmlFor="edit-prod-name"
                          className={styles.formLabel}
                        >
                          Edit Product Name
                        </label>
                        <input
                          id="edit-prod-name"
                          className={styles.formInput}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
                      </div>
                      <div className={styles.formField}>
                        <label
                          htmlFor="edit-prod-brand"
                          className={styles.formLabel}
                        >
                          Edit Brand
                        </label>
                        <input
                          id="edit-prod-brand"
                          className={styles.formInput}
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                        />
                      </div>
                      <div className={styles.formField}>
                        <label
                          htmlFor="edit-prod-category"
                          className={styles.formLabel}
                        >
                          Edit Category
                        </label>
                        <select
                          id="edit-prod-category"
                          className={styles.formInput}
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          required
                        >
                          <optgroup label="Kelompok Atasan (Tops di Pengguna)">
                            {PRODUCT_CATEGORY_OPTIONS.filter(
                              (opt) => opt.group === 'tops',
                            ).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Kelompok Bawahan (Bottoms di Pengguna)">
                            {PRODUCT_CATEGORY_OPTIONS.filter(
                              (opt) => opt.group === 'bottoms',
                            ).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      <div className={styles.formField}>
                        <label
                          htmlFor="edit-prod-source"
                          className={styles.formLabel}
                        >
                          Edit Link Produk (Store URL)
                        </label>
                        <input
                          id="edit-prod-source"
                          type="url"
                          className={styles.formInput}
                          value={editSourceUrl}
                          onChange={(e) => setEditSourceUrl(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.matchingSection}>
                      <fieldset className={styles.fieldsetGroup}>
                        <legend className={styles.formLabel}>
                          Gender Pakaian
                        </legend>
                        <div className={styles.radioGroup}>
                          {(['male', 'female', 'unisex'] as const).map((g) => (
                            <label key={g} className={styles.radioLabel}>
                              <input
                                type="radio"
                                name="edit-prod-gender"
                                value={g}
                                checked={editGender === g}
                                onChange={() => handleEditGenderChange(g)}
                              />
                              <span>
                                {g === 'male'
                                  ? 'Pria (Male)'
                                  : g === 'female'
                                    ? 'Wanita (Female)'
                                    : 'Unisex'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <div className={styles.formField}>
                        <span className={styles.formLabel}>
                          Tipe Body Shape yang Cocok
                        </span>
                        <div className={styles.chipGroup}>
                          {availableEditBodyShapes.map((shapeKey) => {
                            const active = editBodyShapes.includes(shapeKey);
                            return (
                              <button
                                key={shapeKey}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.chip} ${
                                  active ? styles.chipActive : ''
                                }`}
                                onClick={() =>
                                  setEditBodyShapes((prev) =>
                                    prev.includes(shapeKey)
                                      ? prev.filter((item) => item !== shapeKey)
                                      : [...prev, shapeKey],
                                  )
                                }
                              >
                                {BODY_SHAPE_LABELS[shapeKey].display}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.formLabel}>
                          Personal Color Tone yang Cocok
                        </span>
                        <div className={styles.chipGroup}>
                          {COLOR_TONE_OPTIONS.map((tone) => {
                            const active = editColorTones.includes(tone.key);
                            return (
                              <button
                                key={tone.key}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.chip} ${
                                  active ? styles.chipActive : ''
                                }`}
                                onClick={() =>
                                  setEditColorTones((prev) =>
                                    prev.includes(tone.key)
                                      ? prev.filter((item) => item !== tone.key)
                                      : [...prev, tone.key],
                                  )
                                }
                              >
                                {tone.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.formLabel}>
                          Ukuran Tersedia
                        </span>
                        <div className={styles.chipGroup}>
                          {SIZE_OPTIONS.map((size) => {
                            const active = editSizes.includes(size);
                            return (
                              <button
                                key={size}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.chip} ${
                                  active ? styles.chipActive : ''
                                }`}
                                onClick={() =>
                                  setEditSizes((prev) =>
                                    prev.includes(size)
                                      ? prev.filter((item) => item !== size)
                                      : [...prev, size],
                                  )
                                }
                              >
                                {size}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className={styles.modalFooter}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setEditingProduct(null)}
                      >
                        Batal
                      </button>
                      <button type="submit" className={styles.primaryButton}>
                        Simpan Perubahan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'costs' ? (
          <section className={styles.sectionCard} aria-label="Usage and Costs">
            <h2 className={styles.sectionHeading}>
              Provider Usage &amp; Cost Breakdown (Estimated vs Actual)
            </h2>
            <p className={styles.metricSubtext} style={{ marginBottom: '1rem' }}>
              Estimated (Gemini): {formatIdr(summary.costs.geminiEstimatedIdr)} ·
              Actual (FASHN): {formatIdr(summary.costs.fashnActualIdr)} · Total:{' '}
              {formatIdr(summary.costs.totalCostIdr)}
            </p>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeaderCell}>Provider</th>
                  <th className={styles.tableHeaderCell}>Feature</th>
                  <th className={styles.tableHeaderCell}>Model</th>
                  <th className={styles.tableHeaderCell}>Cost Type</th>
                  <th className={styles.tableHeaderCell}>Tokens (In/Out)</th>
                  <th className={styles.tableHeaderCell}>Cost (IDR)</th>
                </tr>
              </thead>
              <tbody>
                {summary.costs.events.map((ev) => (
                  <tr key={ev.id}>
                    <td className={styles.tableCell}>{ev.provider}</td>
                    <td className={styles.tableCell}>{ev.feature}</td>
                    <td className={styles.tableCell}>{ev.model}</td>
                    <td className={styles.tableCell}>
                      <span className={styles.badge}>
                        {ev.costType === 'estimated'
                          ? 'Estimated (Gemini)'
                          : 'Actual (FASHN)'}
                      </span>
                    </td>
                    <td className={styles.tableCell}>
                      {ev.inputTokens !== null
                        ? `${ev.inputTokens} / ${ev.outputTokens ?? 0}`
                        : 'Per-render'}
                    </td>
                    <td className={styles.tableCell}>
                      {formatIdr(ev.amountIdr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === 'financials' ? (
          <section aria-label="Financials and Profit Loss">
            <div className={styles.financialHeader}>
              <div
                className={styles.periodFilterGroup}
                role="group"
                aria-label="Filter periode keuangan"
              >
                {(
                  [
                    { key: 'all', label: 'Semua Waktu' },
                    { key: 'today', label: 'Hari Ini' },
                    { key: '7days', label: '7 Hari Terakhir' },
                    { key: 'thisMonth', label: 'Bulan Ini' },
                  ] as const
                ).map((period) => (
                  <button
                    key={period.key}
                    type="button"
                    aria-pressed={financialPeriod === period.key}
                    className={`${styles.periodChip} ${
                      financialPeriod === period.key
                        ? styles.periodChipActive
                        : ''
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
                onClick={exportFinancialsCsv}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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

            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Gross Revenue</div>
                <div className={styles.metricValue}>
                  {formatIdr(filteredFinancialKpis.grossRevenueIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  {filteredFinancialKpis.paidCount} paid transactions
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Total COGS (HPP)</div>
                <div className={styles.metricValue}>
                  {formatIdr(filteredFinancialKpis.totalCogsIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  Midtrans: {formatIdr(filteredFinancialKpis.midtransFeeIdr)} ·
                  Gemini: {formatIdr(filteredFinancialKpis.geminiCostIdr)} ·
                  FASHN: {formatIdr(filteredFinancialKpis.fashnCostIdr)}
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>
                  Laba Bersih (Net Profit)
                </div>
                <div className={styles.metricValue}>
                  {formatIdr(filteredFinancialKpis.grossProfitIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  Gross Margin: {filteredFinancialKpis.grossMarginPercent}%
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>
                  Unit Economics (Avg/User)
                </div>
                <div className={styles.metricValue}>
                  {formatIdr(filteredFinancialKpis.avgProfitPerUserIdr)}
                </div>
                <div className={styles.metricSubtext}>
                  Avg COGS/User:{' '}
                  {formatIdr(filteredFinancialKpis.avgCogsPerUserIdr)}
                </div>
              </div>
            </div>

            <div className={styles.sectionCard}>
              <h2 className={styles.sectionHeading}>
                Buku Besar Laba/Rugi (P&amp;L Ledger per Sesi)
              </h2>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th className={styles.tableHeaderCell}>Order Ref</th>
                    <th className={styles.tableHeaderCell}>Tanggal Bayar</th>
                    <th className={styles.tableHeaderCell}>Pendapatan</th>
                    <th className={styles.tableHeaderCell}>
                      Fee Midtrans (0.7%)
                    </th>
                    <th className={styles.tableHeaderCell}>Beban Gemini</th>
                    <th className={styles.tableHeaderCell}>Beban FASHN</th>
                    <th className={styles.tableHeaderCell}>Laba Kotor</th>
                    <th className={styles.tableHeaderCell}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {financialLedgerEntries.map((entry) => (
                    <tr key={entry.paymentId}>
                      <td className={styles.tableCell}>
                        <strong>{entry.orderReference}</strong>
                      </td>
                      <td className={styles.tableCell}>{entry.paidAt}</td>
                      <td className={styles.tableCell}>
                        {formatIdr(entry.revenueIdr)}
                      </td>
                      <td className={styles.tableCell}>
                        {formatIdr(entry.midtransFeeIdr)}
                      </td>
                      <td className={styles.tableCell}>
                        {formatIdr(entry.geminiCostIdr)}
                      </td>
                      <td className={styles.tableCell}>
                        {formatIdr(entry.fashnCostIdr)}
                      </td>
                      <td className={styles.tableCell}>
                        <strong>{formatIdr(entry.grossProfitIdr)}</strong>
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
