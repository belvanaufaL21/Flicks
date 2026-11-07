import 'server-only';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  canUseLocalDevFallback,
  getLocalDevMemoryState,
  type AdminProfileRecord,
  type CatalogProductRecord,
  type ProductGender,
  type ProductMatchingLabels,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';
import type { PrimarySeason } from '@/server/analysis/schemas';
import type { BodyShapeCategory } from '@/shared/body-shape-labels';

export type {
  AdminProfileRecord,
  CatalogProductRecord,
  ProductGender,
  ProductMatchingLabels,
};

export interface AdminTransactionItem {
  paymentId: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  token: {
    id: string;
    status: string;
    reservedAt: string | null;
    consumedAt: string | null;
  } | null;
}

export interface AdminTokenItem {
  id: string;
  status: 'available' | 'reserved' | 'consumed' | 'expired';
  paymentId: string | null;
  reservedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
}

export interface AdminJobItem {
  id: string;
  tokenId: string;
  type: 'analysis' | 'virtual_try_on';
  status: string;
  provider: string;
  providerReference: string | null;
  attemptCount: number;
  tokenRecoveryStatus: string;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsageCostItem {
  id: string;
  jobId: string;
  provider: 'gemini' | 'fashn';
  feature: 'personal_color' | 'body_shape' | 'virtual_try_on';
  model: string;
  costType: 'estimated' | 'actual';
  amountIdr: number;
  inputTokens: number | null;
  outputTokens: number | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
}

export interface AdminSummaryMetrics {
  totalRevenueIdr: number;
  paidTransactionsCount: number;
  totalTransactionsCount?: number;
  totalTokensCount: number;
  availableTokensCount?: number;
  reservedTokensCount?: number;
  consumedTokensCount?: number;
  expiredTokensCount?: number;
  totalJobsCount?: number;
  completedJobsCount?: number;
  failedJobsCount?: number;
  geminiEstimatedCostIdr: number;
  fashnActualCostIdr: number;
  usageEvents?: AdminUsageCostItem[];
}

export interface AdminFinancialMetrics {
  grossRevenueIdr: number;
  midtransFeeIdr: number;
  geminiCostIdr: number;
  fashnCostIdr: number;
  totalCogsIdr: number;
  grossProfitIdr: number;
  grossMarginPercent: number;
}

export interface AdminDashboardSummary {
  transactions: {
    totalCount: number;
    paidCount: number;
    totalRevenueIdr: number;
  };
  tokens: {
    totalCount: number;
    availableCount: number;
    reservedCount: number;
    consumedCount: number;
    expiredCount: number;
  };
  jobs: {
    totalCount: number;
    completedCount: number;
    failedCount: number;
    successRatePercent: number;
  };
  costs: {
    geminiEstimatedIdr: number;
    fashnActualIdr: number;
    totalCostIdr: number;
    events: AdminUsageCostItem[];
  };
  financials: AdminFinancialMetrics;
}

export interface CreateProductInput {
  name: string;
  brand?: string | null;
  category: string;
  subcategory?: string | null;
  imagePath: string;
  sourceUrl?: string | null;
  labels?: ProductMatchingLabels;
  isActive?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  brand?: string | null;
  category?: string;
  subcategory?: string | null;
  imagePath?: string;
  sourceUrl?: string | null;
  labels?: ProductMatchingLabels;
  isActive?: boolean;
}

const VALID_PRODUCT_GENDERS = new Set<ProductGender>([
  'male',
  'female',
  'unisex',
]);

// ponytail: lightweight label normalizer on JSONB; upgrade to strict Zod schema if external API consumers write products.
export function normalizeProductLabels(
  raw?: ProductMatchingLabels | Record<string, unknown> | null,
): ProductMatchingLabels {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const hasMatchingKeys =
    'gender' in raw ||
    'body_shapes' in raw ||
    'color_tones' in raw ||
    'sizes' in raw;

  if (!hasMatchingKeys) {
    return { ...raw };
  }

  const rawGender =
    typeof raw.gender === 'string'
      ? (raw.gender.trim().toLowerCase() as ProductGender)
      : 'unisex';
  const gender: ProductGender = VALID_PRODUCT_GENDERS.has(rawGender)
    ? rawGender
    : 'unisex';

  const bodyShapes = Array.isArray(raw.body_shapes)
    ? Array.from(
        new Set(
          raw.body_shapes
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim() as BodyShapeCategory)
            .filter(Boolean),
        ),
      )
    : [];

  const colorTones = Array.isArray(raw.color_tones)
    ? Array.from(
        new Set(
          raw.color_tones
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().toLowerCase() as PrimarySeason)
            .filter(Boolean),
        ),
      )
    : [];

  const sizes = Array.isArray(raw.sizes)
    ? Array.from(
        new Set(
          raw.sizes
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      )
    : [];

  return {
    ...raw,
    gender,
    body_shapes: bodyShapes,
    color_tones: colorTones,
    sizes,
  };
}

export interface AdminRepository {
  findProfileByUserId(userId: string): Promise<AdminProfileRecord | null>;
  resolveUserIdFromToken?(accessToken: string): Promise<string | null>;
  listTransactions(): Promise<AdminTransactionItem[]>;
  listTokens?(): Promise<AdminTokenItem[]>;
  listJobs(): Promise<AdminJobItem[]>;
  listProducts(): Promise<CatalogProductRecord[]>;
  createProduct(product: CatalogProductRecord): Promise<CatalogProductRecord>;
  updateProduct(
    productId: string,
    patch: Partial<Omit<CatalogProductRecord, 'id' | 'createdAt'>>,
  ): Promise<CatalogProductRecord | null>;
  deleteProduct?(productId: string): Promise<boolean>;
  getSummaryMetrics(): Promise<AdminSummaryMetrics>;
}

export interface AdminServiceOptions {
  createId?: () => string;
  now?: () => Date;
  allowLocalDevFallback?: boolean;
}

function extractBearerOrCookieToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sb-access-token='));
    if (match) {
      const value = decodeURIComponent(match.slice('sb-access-token='.length).trim());
      if (value) return value;
    }
  }

  return null;
}

function computeDurationMs(createdAt: string, updatedAt: string): number | null {
  const start = Date.parse(createdAt);
  const end = Date.parse(updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return end - start;
}

export function createAdminService(
  repository: AdminRepository,
  options: AdminServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const allowLocalDevFallback =
    options.allowLocalDevFallback ?? canUseLocalDevFallback();

  return {
    async assertAdminUser(
      userId: string | null | undefined,
    ): Promise<AdminProfileRecord> {
      const normalized = userId?.trim() ?? '';
      if (!normalized) {
        throw new Error('UNAUTHENTICATED');
      }

      const profile = await repository.findProfileByUserId(normalized);
      if (
        !profile ||
        (profile.role !== 'admin' && profile.role !== 'superadmin')
      ) {
        throw new Error('FORBIDDEN');
      }

      return profile;
    },

    async assertAdminSession(request: Request): Promise<AdminProfileRecord> {
      const devHeader = request.headers.get('x-flicks-dev-admin')?.trim();
      const token = extractBearerOrCookieToken(request);

      if (
        allowLocalDevFallback &&
        (devHeader === '1' ||
          devHeader === 'true' ||
          token === 'dev-admin-token')
      ) {
        console.warn(
          '[SECURITY WARNING] Local dev admin fallback active: bypassing Supabase Auth for local development.',
        );
        return {
          userId: 'dev-admin-local',
          role: 'superadmin',
          createdAt: now().toISOString(),
        };
      }

      if (!token) {
        throw new Error('UNAUTHENTICATED');
      }

      const userId = repository.resolveUserIdFromToken
        ? await repository.resolveUserIdFromToken(token)
        : token;

      if (!userId) {
        throw new Error('UNAUTHENTICATED');
      }

      return await this.assertAdminUser(userId);
    },

    async getTransactions(): Promise<AdminTransactionItem[]> {
      return await repository.listTransactions();
    },

    async getTokens(): Promise<AdminTokenItem[]> {
      if (repository.listTokens) {
        return await repository.listTokens();
      }
      return [];
    },

    async getJobs(): Promise<AdminJobItem[]> {
      return await repository.listJobs();
    },

    async getProducts(): Promise<CatalogProductRecord[]> {
      return await repository.listProducts();
    },

    async createProduct(
      input: CreateProductInput,
    ): Promise<CatalogProductRecord> {
      const name = input.name?.trim();
      const category = input.category?.trim();
      const imagePath = input.imagePath?.trim();

      if (!name || !category || !imagePath) {
        throw new Error('INVALID_PRODUCT_INPUT');
      }

      const timestamp = now().toISOString();
      const record: CatalogProductRecord = {
        id: createId(),
        name,
        brand: input.brand?.trim() || null,
        category,
        subcategory: input.subcategory?.trim() || null,
        imagePath,
        sourceUrl: input.sourceUrl?.trim() || null,
        labels: normalizeProductLabels(input.labels),
        isActive: input.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return await repository.createProduct(record);
    },

    async updateProduct(
      productId: string,
      patch: UpdateProductInput,
    ): Promise<CatalogProductRecord> {
      const normalizedId = productId?.trim();
      if (!normalizedId) {
        throw new Error('INVALID_PRODUCT_INPUT');
      }

      const updated = await repository.updateProduct(normalizedId, {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.brand !== undefined
          ? { brand: patch.brand?.trim() || null }
          : {}),
        ...(patch.category !== undefined
          ? { category: patch.category.trim() }
          : {}),
        ...(patch.subcategory !== undefined
          ? { subcategory: patch.subcategory?.trim() || null }
          : {}),
        ...(patch.imagePath !== undefined
          ? { imagePath: patch.imagePath.trim() }
          : {}),
        ...(patch.sourceUrl !== undefined
          ? { sourceUrl: patch.sourceUrl?.trim() || null }
          : {}),
        ...(patch.labels !== undefined
          ? { labels: normalizeProductLabels(patch.labels) }
          : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        updatedAt: now().toISOString(),
      });

      if (!updated) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      return updated;
    },

    async deactivateProduct(productId: string): Promise<CatalogProductRecord> {
      return await this.updateProduct(productId, { isActive: false });
    },

    async deleteProduct(productId: string): Promise<void> {
      const normalizedId = productId?.trim();
      if (!normalizedId) {
        throw new Error('INVALID_PRODUCT_INPUT');
      }
      if (repository.deleteProduct) {
        const deleted = await repository.deleteProduct(normalizedId);
        if (!deleted) {
          throw new Error('PRODUCT_NOT_FOUND');
        }
        return;
      }
      await this.deactivateProduct(normalizedId);
    },

    async getSummary(): Promise<AdminDashboardSummary> {
      const metrics = await repository.getSummaryMetrics();
      const totalJobs = metrics.totalJobsCount ?? 0;
      const completedJobs = metrics.completedJobsCount ?? 0;
      const failedJobs = metrics.failedJobsCount ?? 0;
      const successRatePercent =
        totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

      const grossRevenueIdr = metrics.totalRevenueIdr;
      // ponytail: hardcoded 0.7% Midtrans QRIS MDR rate; move to payment record fee column when supporting non-QRIS payment methods
      const midtransFeeIdr = Math.round(grossRevenueIdr * 0.007);
      const geminiCostIdr = metrics.geminiEstimatedCostIdr;
      const fashnCostIdr = metrics.fashnActualCostIdr;
      const totalCogsIdr = midtransFeeIdr + geminiCostIdr + fashnCostIdr;
      const grossProfitIdr = grossRevenueIdr - totalCogsIdr;
      const grossMarginPercent =
        grossRevenueIdr > 0
          ? Math.round((grossProfitIdr / grossRevenueIdr) * 100)
          : 0;

      return {
        transactions: {
          totalCount:
            metrics.totalTransactionsCount ?? metrics.paidTransactionsCount,
          paidCount: metrics.paidTransactionsCount,
          totalRevenueIdr: grossRevenueIdr,
        },
        tokens: {
          totalCount: metrics.totalTokensCount,
          availableCount: metrics.availableTokensCount ?? 0,
          reservedCount: metrics.reservedTokensCount ?? 0,
          consumedCount: metrics.consumedTokensCount ?? 0,
          expiredCount: metrics.expiredTokensCount ?? 0,
        },
        jobs: {
          totalCount: totalJobs,
          completedCount: completedJobs,
          failedCount: failedJobs,
          successRatePercent,
        },
        costs: {
          geminiEstimatedIdr: geminiCostIdr,
          fashnActualIdr: fashnCostIdr,
          totalCostIdr: geminiCostIdr + fashnCostIdr,
          events: metrics.usageEvents ?? [],
        },
        financials: {
          grossRevenueIdr,
          midtransFeeIdr,
          geminiCostIdr,
          fashnCostIdr,
          totalCogsIdr,
          grossProfitIdr,
          grossMarginPercent,
        },
      };
    },
  };
}

interface InMemoryPaymentItem {
  id: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  paidAt: string | null;
  createdAt: string;
}

interface InMemoryJobItem {
  id: string;
  tokenId: string;
  status: string;
  provider: string;
  providerReference: string | null;
  attemptCount: number;
  tokenRecoveryStatus: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createInMemoryAdminDataRepository(): AdminRepository {
  const state = getLocalDevMemoryState();

  return {
    async findProfileByUserId(userId) {
      return state.adminProfilesByUserId.get(userId) ?? null;
    },

    async resolveUserIdFromToken(accessToken) {
      const trimmed = accessToken.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('user:')) {
        return trimmed.slice('user:'.length).trim() || null;
      }
      if (state.adminProfilesByUserId.has(trimmed)) {
        return trimmed;
      }
      return null;
    },

    async listTransactions() {
      const tokensList = Array.from(state.tokensByHash.values());
      const paymentsList = Array.from(
        state.paymentsById.values(),
      ) as InMemoryPaymentItem[];

      return paymentsList
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((payment) => {
          const linkedToken =
            tokensList.find((tok) => tok.paymentId === payment.id) ?? null;
          return {
            paymentId: payment.id,
            providerReference: payment.providerReference,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            paidAt: payment.paidAt,
            createdAt: payment.createdAt,
            token: linkedToken
              ? {
                  id: linkedToken.id,
                  status: linkedToken.status,
                  reservedAt: linkedToken.reservedAt,
                  consumedAt: linkedToken.consumedAt,
                }
              : null,
          };
        });
    },

    async listTokens() {
      return Array.from(state.tokensByHash.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((tok) => ({
          id: tok.id,
          status: tok.status,
          paymentId: tok.paymentId,
          reservedAt: tok.reservedAt,
          consumedAt: tok.consumedAt,
          createdAt: tok.createdAt,
        }));
    },

    async listJobs() {
      const rawAnalysisJobs = Array.from(
        state.analysisJobsById.values(),
      ) as InMemoryJobItem[];
      const analysisJobs: AdminJobItem[] = rawAnalysisJobs.map((job) => ({
        id: job.id,
        tokenId: job.tokenId,
        type: 'analysis',
        status: job.status,
        provider: job.provider,
        providerReference: job.providerReference,
        attemptCount: job.attemptCount,
        tokenRecoveryStatus: job.tokenRecoveryStatus,
        durationMs: computeDurationMs(job.createdAt, job.updatedAt),
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }));

      const rawVtoJobs = Array.from(
        state.vtoJobsById.values(),
      ) as InMemoryJobItem[];
      const vtoJobs: AdminJobItem[] = rawVtoJobs.map((job) => ({
        id: job.id,
        tokenId: job.tokenId,
        type: 'virtual_try_on',
        status: job.status,
        provider: job.provider,
        providerReference: job.providerReference,
        attemptCount: job.attemptCount,
        tokenRecoveryStatus: job.tokenRecoveryStatus,
        durationMs: computeDurationMs(job.createdAt, job.updatedAt),
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }));

      return [...analysisJobs, ...vtoJobs].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },

    async listProducts() {
      return Array.from(state.productsById.values());
    },

    async createProduct(product) {
      state.productsById.set(product.id, product);
      return product;
    },

    async updateProduct(productId, patch) {
      const existing = state.productsById.get(productId);
      if (!existing) return null;
      const updated: CatalogProductRecord = {
        ...existing,
        ...patch,
      };
      state.productsById.set(productId, updated);
      return updated;
    },

    async deleteProduct(productId) {
      return state.productsById.delete(productId);
    },

    async getSummaryMetrics() {
      const payments = Array.from(
        state.paymentsById.values(),
      ) as InMemoryPaymentItem[];
      const paidPayments = payments.filter((p) => p.status === 'paid');
      const totalRevenueIdr = paidPayments.reduce(
        (sum, p) => sum + p.amount,
        0,
      );

      const tokens = Array.from(state.tokensByHash.values());
      const allJobs = [
        ...(Array.from(state.analysisJobsById.values()) as InMemoryJobItem[]),
        ...(Array.from(state.vtoJobsById.values()) as InMemoryJobItem[]),
      ];

      let geminiEstimatedCostIdr = 0;
      let fashnActualCostIdr = 0;

      const usageEvents: AdminUsageCostItem[] = state.usageEvents.map(
        (event) => {
          const isGemini = event.provider === 'gemini';
          if (isGemini) {
            geminiEstimatedCostIdr += event.estimatedCostIdr;
          } else {
            fashnActualCostIdr += event.estimatedCostIdr;
          }

          return {
            id: event.id,
            jobId: event.jobId,
            provider: event.provider,
            feature: event.feature,
            model: event.model,
            costType: isGemini ? 'estimated' : 'actual',
            amountIdr: event.estimatedCostIdr,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            status: event.status,
            errorCode: event.errorCode,
            createdAt: event.createdAt,
          };
        },
      );

      return {
        totalRevenueIdr,
        paidTransactionsCount: paidPayments.length,
        totalTransactionsCount: payments.length,
        totalTokensCount: tokens.length,
        availableTokensCount: tokens.filter((t) => t.status === 'available')
          .length,
        reservedTokensCount: tokens.filter((t) => t.status === 'reserved')
          .length,
        consumedTokensCount: tokens.filter((t) => t.status === 'consumed')
          .length,
        expiredTokensCount: tokens.filter((t) => t.status === 'expired').length,
        totalJobsCount: allJobs.length,
        completedJobsCount: allJobs.filter((j) => j.status === 'completed')
          .length,
        failedJobsCount: allJobs.filter((j) => j.status === 'failed').length,
        geminiEstimatedCostIdr,
        fashnActualCostIdr,
        usageEvents,
      };
    },
  };
}

function mapRowToCatalogProduct(
  row: Record<string, unknown>,
): CatalogProductRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    brand: (row.brand as string | null) ?? null,
    category: String(row.category),
    subcategory: (row.subcategory as string | null) ?? null,
    imagePath: String(row.image_path),
    sourceUrl: (row.source_url as string | null) ?? null,
    labels: normalizeProductLabels(
      (row.labels as Record<string, unknown> | null) ?? {},
    ),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createSupabaseAdminRepository(): AdminRepository {
  const client = createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return {
    async findProfileByUserId(userId) {
      const { data, error } = await client
        .from('admin_profiles')
        .select('user_id, role, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }

      return {
        userId: String(data.user_id),
        role: data.role as 'admin' | 'superadmin',
        createdAt: String(data.created_at),
      };
    },

    async resolveUserIdFromToken(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },

    async listTransactions() {
      const [paymentsRes, tokensRes] = await Promise.all([
        client
          .from('payments')
          .select(
            'id, provider_reference, amount, currency, status, paid_at, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(200),
        client
          .from('tokens')
          .select('id, status, payment_id, reserved_at, consumed_at, created_at')
          .limit(500),
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (tokensRes.error) throw tokensRes.error;

      const tokensByPaymentId = new Map<
        string,
        {
          id: string;
          status: string;
          reservedAt: string | null;
          consumedAt: string | null;
        }
      >();

      for (const tok of tokensRes.data ?? []) {
        if (tok.payment_id) {
          tokensByPaymentId.set(String(tok.payment_id), {
            id: String(tok.id),
            status: String(tok.status),
            reservedAt: (tok.reserved_at as string | null) ?? null,
            consumedAt: (tok.consumed_at as string | null) ?? null,
          });
        }
      }

      return (paymentsRes.data ?? []).map((row) => ({
        paymentId: String(row.id),
        providerReference: String(row.provider_reference),
        amount: Number(row.amount),
        currency: String(row.currency),
        status: String(row.status),
        paidAt: (row.paid_at as string | null) ?? null,
        createdAt: String(row.created_at),
        token: tokensByPaymentId.get(String(row.id)) ?? null,
      }));
    },

    async listTokens() {
      const { data, error } = await client
        .from('tokens')
        .select('id, status, payment_id, reserved_at, consumed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: String(row.id),
        status: row.status as AdminTokenItem['status'],
        paymentId: (row.payment_id as string | null) ?? null,
        reservedAt: (row.reserved_at as string | null) ?? null,
        consumedAt: (row.consumed_at as string | null) ?? null,
        createdAt: String(row.created_at),
      }));
    },

    async listJobs() {
      const { data, error } = await client
        .from('jobs')
        .select(
          'id, token_id, type, status, provider, provider_reference, attempt_count, token_recovery_status, error, created_at, updated_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      return (data ?? []).map((row) => {
        const createdAt = String(row.created_at);
        const updatedAt = String(row.updated_at);
        return {
          id: String(row.id),
          tokenId: String(row.token_id),
          type: row.type as 'analysis' | 'virtual_try_on',
          status: String(row.status),
          provider: String(row.provider ?? 'unknown'),
          providerReference: (row.provider_reference as string | null) ?? null,
          attemptCount: Number(row.attempt_count ?? 1),
          tokenRecoveryStatus: String(row.token_recovery_status ?? 'none'),
          durationMs: computeDurationMs(createdAt, updatedAt),
          error: (row.error as string | null) ?? null,
          createdAt,
          updatedAt,
        };
      });
    },

    async listProducts() {
      const { data, error } = await client
        .from('products')
        .select(
          'id, name, brand, category, subcategory, image_path, source_url, labels, is_active, created_at, updated_at',
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapRowToCatalogProduct);
    },

    async createProduct(product) {
      const { data, error } = await client
        .from('products')
        .insert({
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          image_path: product.imagePath,
          source_url: product.sourceUrl,
          labels: product.labels,
          is_active: product.isActive,
          created_at: product.createdAt,
          updated_at: product.updatedAt,
        })
        .select(
          'id, name, brand, category, subcategory, image_path, source_url, labels, is_active, created_at, updated_at',
        )
        .single();

      if (error) throw error;
      return mapRowToCatalogProduct(data);
    },

    async updateProduct(productId, patch) {
      const updatePayload: Record<string, unknown> = {
        updated_at: patch.updatedAt ?? new Date().toISOString(),
      };
      if (patch.name !== undefined) updatePayload.name = patch.name;
      if (patch.brand !== undefined) updatePayload.brand = patch.brand;
      if (patch.category !== undefined) updatePayload.category = patch.category;
      if (patch.subcategory !== undefined)
        updatePayload.subcategory = patch.subcategory;
      if (patch.imagePath !== undefined)
        updatePayload.image_path = patch.imagePath;
      if (patch.sourceUrl !== undefined)
        updatePayload.source_url = patch.sourceUrl;
      if (patch.labels !== undefined) updatePayload.labels = patch.labels;
      if (patch.isActive !== undefined)
        updatePayload.is_active = patch.isActive;

      const { data, error } = await client
        .from('products')
        .update(updatePayload)
        .eq('id', productId)
        .select(
          'id, name, brand, category, subcategory, image_path, source_url, labels, is_active, created_at, updated_at',
        )
        .maybeSingle();

      if (error) throw error;
      return data ? mapRowToCatalogProduct(data) : null;
    },

    async deleteProduct(productId) {
      const { data, error } = await client
        .from('products')
        .delete()
        .eq('id', productId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      return Boolean(data);
    },

    async getSummaryMetrics() {
      const [paymentsRes, tokensRes, jobsRes, usageRes] = await Promise.all([
        client.from('payments').select('amount, status'),
        client.from('tokens').select('status'),
        client.from('jobs').select('status'),
        client
          .from('usage_events')
          .select(
            'id, job_id, provider, feature, model, input_tokens, output_tokens, estimated_cost_idr, status, error_code, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (tokensRes.error) throw tokensRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (usageRes.error) throw usageRes.error;

      const payments = paymentsRes.data ?? [];
      const paidPayments = payments.filter((p) => p.status === 'paid');
      const totalRevenueIdr = paidPayments.reduce(
        (sum, p) => sum + Number(p.amount ?? 0),
        0,
      );

      const tokens = tokensRes.data ?? [];
      const jobs = jobsRes.data ?? [];

      let geminiEstimatedCostIdr = 0;
      let fashnActualCostIdr = 0;

      const usageEvents: AdminUsageCostItem[] = (usageRes.data ?? []).map(
        (row) => {
          const provider = String(row.provider) as 'gemini' | 'fashn';
          const amountIdr = Number(row.estimated_cost_idr ?? 0);
          if (provider === 'gemini') {
            geminiEstimatedCostIdr += amountIdr;
          } else {
            fashnActualCostIdr += amountIdr;
          }

          return {
            id: String(row.id),
            jobId: String(row.job_id),
            provider,
            feature: row.feature as AdminUsageCostItem['feature'],
            model: String(row.model),
            costType: provider === 'gemini' ? 'estimated' : 'actual',
            amountIdr,
            inputTokens:
              row.input_tokens !== null && row.input_tokens !== undefined
                ? Number(row.input_tokens)
                : null,
            outputTokens:
              row.output_tokens !== null && row.output_tokens !== undefined
                ? Number(row.output_tokens)
                : null,
            status: String(row.status),
            errorCode: (row.error_code as string | null) ?? null,
            createdAt: String(row.created_at),
          };
        },
      );

      return {
        totalRevenueIdr,
        paidTransactionsCount: paidPayments.length,
        totalTransactionsCount: payments.length,
        totalTokensCount: tokens.length,
        availableTokensCount: tokens.filter((t) => t.status === 'available')
          .length,
        reservedTokensCount: tokens.filter((t) => t.status === 'reserved')
          .length,
        consumedTokensCount: tokens.filter((t) => t.status === 'consumed')
          .length,
        expiredTokensCount: tokens.filter((t) => t.status === 'expired').length,
        totalJobsCount: jobs.length,
        completedJobsCount: jobs.filter((j) => j.status === 'completed').length,
        failedJobsCount: jobs.filter((j) => j.status === 'failed').length,
        geminiEstimatedCostIdr,
        fashnActualCostIdr,
        usageEvents,
      };
    },
  };
}

export function createDefaultAdminService(options: AdminServiceOptions = {}) {
  const useLocal = canUseLocalDevFallback();
  return createAdminService(
    useLocal
      ? createInMemoryAdminDataRepository()
      : createSupabaseAdminRepository(),
    {
      allowLocalDevFallback: useLocal,
      ...options,
    },
  );
}
