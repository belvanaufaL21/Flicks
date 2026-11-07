import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  canUseLocalDevFallback,
  createInMemoryReportRepository,
  getLocalDevMemoryState,
  type ReportRecord,
  type ReportRepository,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';
import type { AnalysisJobRecord } from '@/server/analysis/analysis.service';
import {
  matchProductsForProfile,
  type RecommendedProductItem,
} from '@/server/recommendations/recommendation.service';
import type { ProductRecord, VtoJobRecord } from '@/server/vto/virtual-try-on.service';

export type { ReportRecord, ReportRepository };

export const REPORT_VALIDITY_HOURS = 72;
export const REPORT_VALIDITY_MS = REPORT_VALIDITY_HOURS * 60 * 60 * 1000;

export type ReportAssetKind = 'vto_result' | 'face_photo' | 'body_photo';

export interface ReportSourceAnalysisRecord {
  id: string;
  tokenId: string;
  status: string;
  input?: {
    photo_path?: string;
    full_body_photo_path?: string;
    gender?: string;
  };
  result: Record<string, unknown> | null;
}

export interface ReportSourceVtoRecord {
  id: string;
  tokenId: string;
  status: string;
  resultPath: string | null;
  input?: {
    product_id?: string;
    photo_path?: string;
  };
}

export interface ReportSourceProductRecord {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
}

export interface ReportSourceJobsRepository {
  findAnalysisByTokenId(tokenId: string): Promise<ReportSourceAnalysisRecord | null>;
  findVtoByTokenId(tokenId: string): Promise<ReportSourceVtoRecord | null>;
  findProductById(productId: string): Promise<ReportSourceProductRecord | null>;
  listActiveProducts?(): Promise<ProductRecord[]>;
}

export interface CustomerReportPayload {
  reportId: string;
  createdAt: string;
  expiresAt: string;
  remainingSeconds: number;
  isExpired: boolean;
  personalColor: {
    status: string;
    primarySeason: string | null;
    subSeason: string | null;
    alternativeCandidates: string[];
    confidenceLevel: string;
    paletteRecommendations: {
      clothing: string[];
      avoid: string[];
    };
    photoQuality: Record<string, unknown> | null;
    uncertaintyNotes: string | null;
    disclaimer: string;
  };
  bodyShape: {
    status: string;
    category: string | null;
    gender?: string | null;
    alternativeCandidates: string[];
    confidenceLevel: string;
    stylingTips: string[];
    photoQuality: Record<string, unknown> | null;
    uncertaintyNotes: string | null;
    disclaimer: string;
  };
  virtualTryOn: {
    status: string;
    product: {
      id: string;
      name: string;
      category: string;
      brand?: string | null;
    };
    resultAssetUrl: string | null;
    disclaimer: string;
  } | null;
  recommendations: {
    tops: RecommendedProductItem[];
    bottoms: RecommendedProductItem[];
  };
  metadata: {
    createdAt: string;
    expiresAt: string;
    disclaimer: string;
  };
}

export type GetReportOutcome =
  | { status: 'active'; payload: CustomerReportPayload }
  | { status: 'expired'; payload: null }
  | { status: 'not_found'; payload: null };

export type GetReportAssetOutcome =
  | { status: 'active'; objectPath: string }
  | { status: 'expired'; objectPath: null }
  | { status: 'not_found'; objectPath: null };

export function hashReportSecret(secret: string): string {
  return createHash('sha256').update(secret.trim()).digest('hex');
}

export function generateReportSecret(): string {
  return randomBytes(24).toString('hex');
}

export interface ReportServiceDependencies {
  reportRepo: ReportRepository;
  jobsRepo: ReportSourceJobsRepository;
  now?: () => Date;
  createId?: () => string;
  generateSecret?: () => string;
}

export function createReportService(deps: ReportServiceDependencies) {
  const {
    reportRepo,
    jobsRepo,
    now = () => new Date(),
    createId = () => randomUUID(),
    generateSecret = generateReportSecret,
  } = deps;

  // Cache issued secrets in-memory per tokenId so idempotent calls within the process return the same link
  const issuedSecretsByTokenId = new Map<string, string>();

  async function createOrGetReport(tokenId: string): Promise<{
    reportId: string;
    secret: string;
    createdAt: string;
    expiresAt: string;
  }> {
    const trimmedTokenId = tokenId.trim();
    if (!trimmedTokenId) {
      throw new Error('INVALID_TOKEN_ID');
    }

    const analysis = await jobsRepo.findAnalysisByTokenId(trimmedTokenId);
    if (
      !analysis ||
      (analysis.status !== 'completed' && analysis.status !== 'needs_review')
    ) {
      throw new Error('REPORT_SOURCE_INCOMPLETE');
    }

    const existing = await reportRepo.findByTokenId(trimmedTokenId);
    const currentMs = now().getTime();

    if (existing && currentMs <= Date.parse(existing.expiresAt)) {
      const cachedSecret = existing.rawSecret ?? issuedSecretsByTokenId.get(trimmedTokenId);
      if (cachedSecret) {
        return {
          reportId: existing.id,
          secret: cachedSecret,
          createdAt: existing.createdAt,
          expiresAt: existing.expiresAt,
        };
      }
    }

    const secret = generateSecret();
    const secretHash = hashReportSecret(secret);
    const createdAt = now().toISOString();
    const expiresAt = new Date(currentMs + REPORT_VALIDITY_MS).toISOString();

    const record = await reportRepo.create({
      id: createId(),
      tokenId: trimmedTokenId,
      secretHash,
      rawSecret: secret,
      createdAt,
      expiresAt,
    });

    issuedSecretsByTokenId.set(trimmedTokenId, secret);

    return {
      reportId: record.id,
      secret,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  async function getReportBySecret(secret: string): Promise<GetReportOutcome> {
    if (!secret || !secret.trim()) {
      return { status: 'not_found', payload: null };
    }

    const secretHash = hashReportSecret(secret);
    const record = await reportRepo.findBySecretHash(secretHash);
    if (!record) {
      return { status: 'not_found', payload: null };
    }

    const currentMs = now().getTime();
    const expiresMs = Date.parse(record.expiresAt);
    if (currentMs > expiresMs) {
      return { status: 'expired', payload: null };
    }

    const [analysis, vto] = await Promise.all([
      jobsRepo.findAnalysisByTokenId(record.tokenId),
      jobsRepo.findVtoByTokenId(record.tokenId),
    ]);

    if (!analysis || !analysis.result) {
      return { status: 'not_found', payload: null };
    }

    const analysisPayload = (analysis.result ?? {}) as {
      personalColor?: {
        status?: string;
        primarySeason?: string | null;
        subSeason?: string | null;
        alternativeCandidates?: string[];
        confidenceLevel?: 'high' | 'medium' | 'low';
        paletteRecommendations?: {
          clothing?: string[];
          avoid?: string[];
        };
        photoQuality?: Record<string, unknown> | null;
        uncertaintyNotes?: string | null;
        disclaimer?: string;
      };
      bodyShape?: {
        status?: string;
        category?: string | null;
        alternativeCandidates?: string[];
        confidenceLevel?: 'high' | 'medium' | 'low';
        stylingTips?: string[];
        photoQuality?: Record<string, unknown> | null;
        uncertaintyNotes?: string | null;
        disclaimer?: string;
      };
    };

    const pcRaw = analysisPayload.personalColor ?? {};
    const bsRaw = analysisPayload.bodyShape ?? {};

    let virtualTryOn: CustomerReportPayload['virtualTryOn'] = null;
    if (vto && vto.status === 'completed' && vto.resultPath) {
      const productId = vto.input?.product_id ?? '';
      const product = productId ? await jobsRepo.findProductById(productId) : null;
      virtualTryOn = {
        status: vto.status,
        product: product ?? {
          id: productId || 'unknown',
          name: 'Produk Pilihan',
          category: 'auto',
        },
        resultAssetUrl: `/api/report/${encodeURIComponent(secret.trim())}/asset/vto_result`,
        disclaimer:
          'Visualisasi Virtual Try-On dihasilkan oleh AI sebagai referensi gaya dan bukan jaminan ukuran presisi.',
      };
    }

    const remainingSeconds = Math.max(0, Math.floor((expiresMs - currentMs) / 1000));

    const activeProducts = jobsRepo.listActiveProducts
      ? await jobsRepo.listActiveProducts()
      : [];
    const recommendations = matchProductsForProfile({
      products: activeProducts,
      gender: analysis.input?.gender === 'male' ? 'male' : 'female',
      bodyShape: bsRaw.category ?? '',
      personalColor: pcRaw.subSeason ?? pcRaw.primarySeason ?? '',
    });

    const payload: CustomerReportPayload = {
      reportId: record.id,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      remainingSeconds,
      isExpired: false,
      personalColor: {
        status: pcRaw.status ?? analysis.status,
        primarySeason: pcRaw.primarySeason ?? null,
        subSeason: pcRaw.subSeason ?? null,
        alternativeCandidates: Array.isArray(pcRaw.alternativeCandidates)
          ? pcRaw.alternativeCandidates
          : [],
        confidenceLevel: pcRaw.confidenceLevel ?? 'low',
        paletteRecommendations: {
          clothing: Array.isArray(pcRaw.paletteRecommendations?.clothing)
            ? pcRaw.paletteRecommendations.clothing
            : [],
          avoid: Array.isArray(pcRaw.paletteRecommendations?.avoid)
            ? pcRaw.paletteRecommendations.avoid
            : [],
        },
        photoQuality: pcRaw.photoQuality ?? null,
        uncertaintyNotes: pcRaw.uncertaintyNotes ?? null,
        disclaimer:
          pcRaw.disclaimer ??
          'Analisis warna personal berbasis AI dipengaruhi oleh kondisi pencahayaan foto.',
      },
      bodyShape: {
        status: bsRaw.status ?? analysis.status,
        category: bsRaw.category ?? null,
        gender: analysis.input?.gender ?? null,
        alternativeCandidates: Array.isArray(bsRaw.alternativeCandidates)
          ? bsRaw.alternativeCandidates
          : [],
        confidenceLevel: bsRaw.confidenceLevel ?? 'low',
        stylingTips: Array.isArray(bsRaw.stylingTips) ? bsRaw.stylingTips : [],
        photoQuality: bsRaw.photoQuality ?? null,
        uncertaintyNotes: bsRaw.uncertaintyNotes ?? null,
        disclaimer:
          bsRaw.disclaimer ??
          'Analisis bentuk tubuh berbasis AI merupakan estimasi proporsi visual dari foto.',
      },
      virtualTryOn,
      recommendations,
      metadata: {
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        disclaimer:
          'Hasil AI FLICKS adalah panduan kurasi gaya personal dan bukan diagnosis medis atau pengukuran fisik mutlak. Laporan ini bersifat pribadi dan otomatis kedaluwarsa dalam 72 jam.',
      },
    };

    return { status: 'active', payload };
  }

  async function getAssetPathForReport(
    secret: string,
    kind: ReportAssetKind,
  ): Promise<GetReportAssetOutcome> {
    if (!secret || !secret.trim()) {
      return { status: 'not_found', objectPath: null };
    }

    const secretHash = hashReportSecret(secret);
    const record = await reportRepo.findBySecretHash(secretHash);
    if (!record) {
      return { status: 'not_found', objectPath: null };
    }

    if (now().getTime() > Date.parse(record.expiresAt)) {
      return { status: 'expired', objectPath: null };
    }

    if (kind === 'vto_result') {
      const vto = await jobsRepo.findVtoByTokenId(record.tokenId);
      if (!vto || !vto.resultPath) {
        return { status: 'not_found', objectPath: null };
      }
      return { status: 'active', objectPath: vto.resultPath };
    }

    const analysis = await jobsRepo.findAnalysisByTokenId(record.tokenId);
    if (!analysis || !analysis.input) {
      return { status: 'not_found', objectPath: null };
    }

    const objectPath =
      kind === 'face_photo'
        ? analysis.input.photo_path
        : analysis.input.full_body_photo_path;

    if (!objectPath) {
      return { status: 'not_found', objectPath: null };
    }

    return { status: 'active', objectPath };
  }

  return {
    createOrGetReport,
    getReportBySecret,
    getAssetPathForReport,
  };
}

export function createInMemoryReportSourceJobsRepository(): ReportSourceJobsRepository {
  const state = getLocalDevMemoryState();

  return {
    async findAnalysisByTokenId(tokenId) {
      for (const item of state.analysisJobsById.values()) {
        const job = item as AnalysisJobRecord;
        if (job.tokenId === tokenId) {
          return {
            id: job.id,
            tokenId: job.tokenId,
            status: job.status,
            input: job.input,
            result: job.result as Record<string, unknown> | null,
          };
        }
      }
      return null;
    },
    async findVtoByTokenId(tokenId) {
      for (const item of state.vtoJobsById.values()) {
        const job = item as VtoJobRecord;
        if (job.tokenId === tokenId) {
          return {
            id: job.id,
            tokenId: job.tokenId,
            status: job.status,
            resultPath: job.resultPath,
            input: job.input,
          };
        }
      }
      return null;
    },
    async findProductById(productId) {
      const product = state.productsById.get(productId);
      if (!product) {
        return null;
      }
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
      };
    },
    async listActiveProducts() {
      return Array.from(state.productsById.values())
        .filter((p) => p.isActive)
        .map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          imagePath: p.imagePath,
          sourceUrl: p.sourceUrl,
          labels: p.labels,
          isActive: p.isActive,
        }));
    },
  };
}

export function createSupabaseReportService() {
  if (canUseLocalDevFallback()) {
    return createReportService({
      reportRepo: createInMemoryReportRepository(),
      jobsRepo: createInMemoryReportSourceJobsRepository(),
    });
  }

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

  const reportRepo: ReportRepository = {
    async create(record) {
      const { data, error } = await client
        .from('reports')
        .upsert(
          {
            id: record.id,
            token_id: record.tokenId,
            secret_hash: record.secretHash,
            created_at: record.createdAt,
            expires_at: record.expiresAt,
          },
          { onConflict: 'token_id' },
        )
        .select('id, token_id, secret_hash, created_at, expires_at')
        .single();

      if (error) {
        throw error;
      }

      return {
        id: String(data.id),
        tokenId: String(data.token_id),
        secretHash: String(data.secret_hash),
        rawSecret: record.rawSecret,
        createdAt: String(data.created_at),
        expiresAt: String(data.expires_at),
      };
    },
    async findBySecretHash(secretHash) {
      const { data, error } = await client
        .from('reports')
        .select('id, token_id, secret_hash, created_at, expires_at')
        .eq('secret_hash', secretHash)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        tokenId: String(data.token_id),
        secretHash: String(data.secret_hash),
        createdAt: String(data.created_at),
        expiresAt: String(data.expires_at),
      };
    },
    async findByTokenId(tokenId) {
      const { data, error } = await client
        .from('reports')
        .select('id, token_id, secret_hash, created_at, expires_at')
        .eq('token_id', tokenId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        tokenId: String(data.token_id),
        secretHash: String(data.secret_hash),
        createdAt: String(data.created_at),
        expiresAt: String(data.expires_at),
      };
    },
  };

  const jobsRepo: ReportSourceJobsRepository = {
    async findAnalysisByTokenId(tokenId) {
      const { data, error } = await client
        .from('jobs')
        .select('id, token_id, status, input, result')
        .eq('token_id', tokenId)
        .eq('type', 'analysis')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        tokenId: String(data.token_id),
        status: String(data.status),
        input: (data.input as Record<string, string>) ?? undefined,
        result: (data.result as Record<string, unknown> | null) ?? null,
      };
    },
    async findVtoByTokenId(tokenId) {
      const { data, error } = await client
        .from('jobs')
        .select('id, token_id, status, input, result')
        .eq('token_id', tokenId)
        .eq('type', 'virtual_try_on')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      const resultObj = data.result as { result_path?: string } | null;
      return {
        id: String(data.id),
        tokenId: String(data.token_id),
        status: String(data.status),
        resultPath: resultObj?.result_path ?? null,
        input: (data.input as Record<string, string>) ?? undefined,
      };
    },
    async findProductById(productId) {
      const { data, error } = await client
        .from('products')
        .select('id, name, category, brand')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        id: String(data.id),
        name: String(data.name),
        category: String(data.category),
        brand: (data.brand as string | null) ?? null,
      };
    },
    async listActiveProducts() {
      const { data, error } = await client
        .from('products')
        .select('id, name, brand, category, image_path, source_url, labels, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        brand: row.brand ? String(row.brand) : null,
        category: String(row.category),
        imagePath: String(row.image_path),
        sourceUrl: row.source_url ? String(row.source_url) : null,
        labels: (row.labels as Record<string, unknown> | null) ?? null,
        isActive: Boolean(row.is_active),
      }));
    },
  };

  return createReportService({ reportRepo, jobsRepo });
}
