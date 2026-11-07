import 'server-only';
import type { PrimarySeason } from '@/server/analysis/schemas';
import type {
  PhotoAsset,
  PhotoStorageRepository,
} from '@/server/storage/private-photo-storage';
import type { TokenRecord, TokenRepository } from '@/server/tokens/token.service';
import type { BodyShapeCategory } from '@/shared/body-shape-labels';

export type ProductGender = 'male' | 'female' | 'unisex';

export interface ProductMatchingLabels {
  gender?: ProductGender;
  body_shapes?: BodyShapeCategory[];
  color_tones?: PrimarySeason[];
  sizes?: string[];
  [key: string]: unknown;
}

export interface UsageEventRecord {
  id: string;
  jobId: string;
  provider: 'gemini' | 'fashn';
  feature: 'personal_color' | 'body_shape' | 'virtual_try_on';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostIdr: number;
  status: 'completed' | 'needs_review' | 'failed';
  errorCode: string | null;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  tokenId: string;
  secretHash: string;
  rawSecret?: string;
  createdAt: string;
  expiresAt: string;
}

export interface ReportRepository {
  create(record: ReportRecord): Promise<ReportRecord>;
  findBySecretHash(secretHash: string): Promise<ReportRecord | null>;
  findByTokenId(tokenId: string): Promise<ReportRecord | null>;
}

export interface AdminProfileRecord {
  userId: string;
  role: 'admin' | 'superadmin';
  createdAt: string;
}

export interface AdminProfileRepository {
  findProfileByUserId(userId: string): Promise<AdminProfileRecord | null>;
  setProfile(profile: AdminProfileRecord): Promise<void>;
}

export interface CatalogProductRecord {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  imagePath: string;
  sourceUrl: string | null;
  labels: ProductMatchingLabels;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VtoQuotaRecord {
  tokenId: string;
  topUsed: boolean;
  bottomUsed: boolean;
  topJobId?: string | null;
  bottomJobId?: string | null;
  updatedAt: string;
}

interface StoredPhotoObject {
  bytes: Uint8Array;
  mimeType: PhotoAsset['mimeType'];
  record?: PhotoAsset;
}

interface LocalDevMemoryState {
  tokensByHash: Map<string, TokenRecord>;
  photosByPath: Map<string, StoredPhotoObject>;
  analysisJobsById: Map<string, unknown>;
  vtoJobsById: Map<string, unknown>;
  vtoQuotas: Map<string, VtoQuotaRecord>;
  usageEvents: UsageEventRecord[];
  reportsByHash: Map<string, ReportRecord>;
  adminProfilesByUserId: Map<string, AdminProfileRecord>;
  productsById: Map<string, CatalogProductRecord>;
  paymentsById: Map<string, unknown>;
}

const globalForDevStore = globalThis as unknown as {
  __flicksLocalDevStore?: LocalDevMemoryState;
};

export function resetLocalDevMemoryState(): void {
  delete globalForDevStore.__flicksLocalDevStore;
}

export function getLocalDevMemoryState(): LocalDevMemoryState {
  if (!globalForDevStore.__flicksLocalDevStore) {
    const productsById = new Map<string, CatalogProductRecord>();
    productsById.set('prod-active-1', {
      id: 'prod-active-1',
      name: 'Terracotta Linen Overshirt',
      brand: 'FLICKS Essentials',
      category: 'tops',
      subcategory: 'overshirt',
      imagePath: 'catalog/terracotta-overshirt.jpg',
      sourceUrl: null,
      labels: { season: 'Warm Autumn', fit: 'relaxed' },
      isActive: true,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    });

    globalForDevStore.__flicksLocalDevStore = {
      tokensByHash: new Map(),
      photosByPath: new Map(),
      analysisJobsById: new Map(),
      vtoJobsById: new Map(),
      vtoQuotas: new Map(),
      usageEvents: [],
      reportsByHash: new Map(),
      adminProfilesByUserId: new Map(),
      productsById,
      paymentsById: new Map(),
    };
  }
  if (!globalForDevStore.__flicksLocalDevStore.vtoQuotas) {
    globalForDevStore.__flicksLocalDevStore.vtoQuotas = new Map();
  }
  return globalForDevStore.__flicksLocalDevStore;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function canUseLocalDevFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && !isSupabaseConfigured();
}

export function createInMemoryTokenRepository(): TokenRepository {
  const state = getLocalDevMemoryState();

  return {
    async findBySecretHash(secretHash) {
      return state.tokensByHash.get(secretHash) ?? null;
    },
    async createMany(tokens) {
      for (const token of tokens) {
        state.tokensByHash.set(token.secretHash, token);
      }
    },
    async reserveBySecretHash(
      secretHash,
      reservedAt,
      allowedFromStatuses = ['available'],
    ) {
      const existing = state.tokensByHash.get(secretHash);
      if (!existing || !allowedFromStatuses.includes(existing.status)) {
        return null;
      }
      const updated: TokenRecord = {
        ...existing,
        status: 'reserved',
        reservedAt,
      };
      state.tokensByHash.set(secretHash, updated);
      return updated;
    },
    async consumeById(tokenId, consumedAt) {
      for (const [hash, record] of state.tokensByHash.entries()) {
        if (record.id === tokenId) {
          if (record.status === 'consumed' || record.status === 'expired') {
            return null;
          }
          const updated: TokenRecord = {
            ...record,
            status: 'consumed',
            consumedAt,
          };
          state.tokensByHash.set(hash, updated);
          return updated;
        }
      }
      return null;
    },
    async findByPaymentId(paymentId) {
      for (const record of state.tokensByHash.values()) {
        if (record.paymentId === paymentId) {
          return record;
        }
      }
      return null;
    },
  };
}

// ponytail: in-memory photo repository stores PhotoAsset directly without DB schema validation; upgrade to sqlite/pg-mem if relational constraints needed in dev
export function createInMemoryPhotoRepository(): PhotoStorageRepository {
  const state = getLocalDevMemoryState();

  return {
    async upload(objectPath, bytes, mimeType) {
      state.photosByPath.set(objectPath, { bytes, mimeType });
    },
    async createRecord(asset) {
      const existing = state.photosByPath.get(asset.objectPath);
      if (existing) {
        existing.record = asset;
      }
    },
    async deleteObject(objectPath) {
      state.photosByPath.delete(objectPath);
    },
    async deleteRecord(id) {
      for (const [path, entry] of state.photosByPath.entries()) {
        if (entry.record?.id === id) {
          state.photosByPath.delete(path);
        }
      }
    },
    async downloadObject(objectPath) {
      const entry = state.photosByPath.get(objectPath);
      if (!entry) {
        return null;
      }
      return {
        bytes: entry.bytes,
        mimeType: entry.mimeType,
      };
    },
  };
}

export function createInMemoryReportRepository(): ReportRepository {
  const state = getLocalDevMemoryState();

  return {
    async create(record) {
      state.reportsByHash.set(record.secretHash, record);
      return record;
    },
    async findBySecretHash(secretHash) {
      return state.reportsByHash.get(secretHash) ?? null;
    },
    async findByTokenId(tokenId) {
      for (const record of state.reportsByHash.values()) {
        if (record.tokenId === tokenId) {
          return record;
        }
      }
      return null;
    },
  };
}

export function createInMemoryAdminRepository(): AdminProfileRepository {
  const state = getLocalDevMemoryState();

  return {
    async findProfileByUserId(userId) {
      return state.adminProfilesByUserId.get(userId) ?? null;
    },
    async setProfile(profile) {
      state.adminProfilesByUserId.set(profile.userId, profile);
    },
  };
}

