import type {
  AdminJobItem,
  AdminTransactionItem,
  AdminUsageCostItem,
  ProductGender,
} from '@/server/admin/admin.service';
import type { PrimarySeason } from '@/server/analysis/schemas';
import {
  FEMALE_BODY_SHAPES,
  MALE_BODY_SHAPES,
  type BodyShapeCategory,
} from '@/shared/body-shape-labels';

export type FinancialPeriodFilter = 'all' | 'today' | '7days' | 'thisMonth';

export type AdminTabKey =
  | 'summary'
  | 'transactions'
  | 'jobs'
  | 'products'
  | 'costs'
  | 'financials';

export interface KillSwitchViewState {
  paidWorkPaused: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface FinancialLedgerEntry {
  paymentId: string;
  orderReference: string;
  paidAt: string;
  revenueIdr: number;
  midtransFeeIdr: number;
  geminiCostIdr: number;
  fashnCostIdr: number;
  totalCogsIdr: number;
  grossProfitIdr: number;
  grossMarginPercent: number;
}

export interface FinancialKpis {
  paidCount: number;
  grossRevenueIdr: number;
  midtransFeeIdr: number;
  geminiCostIdr: number;
  fashnCostIdr: number;
  totalCogsIdr: number;
  grossProfitIdr: number;
  grossMarginPercent: number;
  avgProfitPerUserIdr: number;
  avgCogsPerUserIdr: number;
}

export const COLOR_TONE_OPTIONS: Array<{ key: PrimarySeason; label: string }> = [
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'autumn', label: 'Autumn' },
  { key: 'winter', label: 'Winter' },
];

export const SIZE_OPTIONS = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'All Size',
] as const;

export const PRODUCT_CATEGORY_OPTIONS = [
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

export function isBottomsCategory(
  rawCategory: string | null | undefined,
): boolean {
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

export function getBodyShapesForGender(
  gender: ProductGender,
): BodyShapeCategory[] {
  const maleShapes = MALE_BODY_SHAPES.filter((s) => s !== 'unknown');
  const femaleShapes = FEMALE_BODY_SHAPES.filter((s) => s !== 'unknown');
  if (gender === 'male') return maleShapes;
  if (gender === 'female') return femaleShapes;
  return Array.from(new Set([...maleShapes, ...femaleShapes]));
}

export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function sanitizeCsvCell(
  value: string | number | null | undefined,
): string {
  const str = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}

// ponytail: client-side filter for in-memory lists; move to server query when transactions > 5,000
export function filterTransactionsByPeriod(
  transactions: AdminTransactionItem[] = [],
  period: FinancialPeriodFilter,
  now: Date = new Date(),
): AdminTransactionItem[] {
  const paidTx = (transactions || []).filter((t) => t.status === 'paid');
  if (period === 'all') return paidTx;

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
    if (period === 'today') return timestamp >= startOfToday;
    if (period === '7days') return timestamp >= sevenDaysAgo;
    if (period === 'thisMonth') return timestamp >= startOfMonth;
    return true;
  });
}

// ponytail: in-memory ledger join; move to DB view if paid transactions > 5,000
export function buildFinancialLedgerEntries(
  transactions: AdminTransactionItem[],
  jobs: AdminJobItem[] = [],
  costEvents: AdminUsageCostItem[] = [],
): FinancialLedgerEntry[] {
  const jobsByTokenId = new Map<string, AdminJobItem[]>();
  for (const job of jobs ?? []) {
    const list = jobsByTokenId.get(job.tokenId) ?? [];
    list.push(job);
    jobsByTokenId.set(job.tokenId, list);
  }

  const eventsByJobId = new Map<string, AdminUsageCostItem[]>();
  for (const ev of costEvents ?? []) {
    const list = eventsByJobId.get(ev.jobId) ?? [];
    list.push(ev);
    eventsByJobId.set(ev.jobId, list);
  }

  return transactions.map((tx) => {
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

    // Default fallback unit economics if not captured in events
    if (
      geminiCostIdr === 0 &&
      tx.status.toLowerCase() === 'paid' &&
      tx.token?.status === 'consumed'
    ) {
      geminiCostIdr = 500;
    }
    if (
      fashnCostIdr === 0 &&
      tx.status.toLowerCase() === 'paid' &&
      tx.token?.status === 'consumed'
    ) {
      fashnCostIdr = 1350;
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
}

export function computeFinancialKpis(
  entries: FinancialLedgerEntry[],
): FinancialKpis {
  const paidCount = entries.length;
  const grossRevenueIdr = entries.reduce(
    (acc, item) => acc + item.revenueIdr,
    0,
  );
  const midtransFeeIdr = entries.reduce(
    (acc, item) => acc + item.midtransFeeIdr,
    0,
  );
  const geminiCostIdr = entries.reduce(
    (acc, item) => acc + item.geminiCostIdr,
    0,
  );
  const fashnCostIdr = entries.reduce(
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
}

export function generateFinancialsCsv(entries: FinancialLedgerEntry[]): string {
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

  const rows = entries.map((entry) => [
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

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportFinancialsCsv(
  entries: FinancialLedgerEntry[],
  period: FinancialPeriodFilter = 'all',
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const csvContent = generateFinancialsCsv(entries);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const nowStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute(
    'download',
    `flicks-financials-${period}-${nowStr}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
