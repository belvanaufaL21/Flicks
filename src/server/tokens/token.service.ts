import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  canUseLocalDevFallback,
  createInMemoryTokenRepository,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';

export type TokenStatus = 'available' | 'reserved' | 'consumed' | 'expired';

export interface TokenRecord {
  id: string;
  secretHash: string;
  status: TokenStatus;
  paymentId: string | null;
  reservedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
}

export interface IssuedDevToken {
  id: string;
  secret: string;
  status: 'available';
}

export interface TokenRepository {
  findBySecretHash(secretHash: string): Promise<TokenRecord | null>;
  createMany?(tokens: TokenRecord[]): Promise<void>;
  reserveBySecretHash?(
    secretHash: string,
    reservedAt: string,
    allowedFromStatuses?: TokenStatus[],
  ): Promise<TokenRecord | null>;
  consumeById?(tokenId: string, consumedAt: string): Promise<TokenRecord | null>;
  findByPaymentId?(paymentId: string): Promise<TokenRecord | null>;
}

export interface TokenServiceOptions {
  createId?: () => string;
  createSecret?: () => string;
  now?: () => Date;
}

export type TokenVerificationErrorCode =
  | 'TOKEN_REQUIRED'
  | 'TOKEN_CONSUMED'
  | 'TOKEN_EXPIRED';

export type TokenVerificationResult =
  | {
      ok: true;
      token: TokenRecord;
    }
  | {
      ok: false;
      code: TokenVerificationErrorCode;
      token?: TokenRecord;
    };

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const raw = authorizationHeader.slice('Bearer '.length).trim();
  return raw.length > 0 ? raw : null;
}

export function createTokenService(
  repository: TokenRepository,
  options: TokenServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const createSecret =
    options.createSecret ?? (() => randomBytes(24).toString('hex'));
  const now = options.now ?? (() => new Date());

  return {
    async createDevTokens(count = 1): Promise<IssuedDevToken[]> {
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        throw new RangeError('count must be an integer between 1 and 20');
      }
      if (!repository.createMany) {
        throw new Error('Token repository does not support createMany');
      }

      const createdAt = now().toISOString();
      const records: TokenRecord[] = [];
      const issued: IssuedDevToken[] = [];

      for (let i = 0; i < count; i += 1) {
        const id = createId();
        const secret = createSecret();
        records.push({
          id,
          secretHash: hashTokenSecret(secret),
          status: 'available',
          paymentId: null,
          reservedAt: null,
          consumedAt: null,
          createdAt,
        });
        issued.push({
          id,
          secret,
          status: 'available',
        });
      }

      await repository.createMany(records);
      return issued;
    },

    async verifyToken(
      secret: string | null | undefined,
    ): Promise<TokenVerificationResult> {
      const normalized = secret?.trim();
      if (!normalized) {
        return { ok: false, code: 'TOKEN_REQUIRED' };
      }

      const secretHash = hashTokenSecret(normalized);
      const token = await repository.findBySecretHash(secretHash);
      if (!token) {
        return { ok: false, code: 'TOKEN_REQUIRED' };
      }

      if (token.status === 'consumed') {
        return { ok: false, code: 'TOKEN_CONSUMED', token };
      }

      if (token.status === 'expired') {
        return { ok: false, code: 'TOKEN_EXPIRED' };
      }

      return { ok: true, token };
    },

    async reserveToken(
      secret: string | null | undefined,
      reserveOptions: { allowReserved?: boolean } = {},
    ): Promise<TokenVerificationResult> {
      const normalized = secret?.trim();
      if (!normalized) {
        return { ok: false, code: 'TOKEN_REQUIRED' };
      }

      if (!repository.reserveBySecretHash) {
        throw new Error('Token repository does not support reserveBySecretHash');
      }

      const secretHash = hashTokenSecret(normalized);
      const allowedStatuses: TokenStatus[] = reserveOptions.allowReserved
        ? ['available', 'reserved']
        : ['available'];
      const reserved = await repository.reserveBySecretHash(
        secretHash,
        now().toISOString(),
        allowedStatuses,
      );

      if (reserved) {
        return { ok: true, token: reserved };
      }

      const existing = await repository.findBySecretHash(secretHash);
      if (!existing) {
        return { ok: false, code: 'TOKEN_REQUIRED' };
      }

      if (existing.status === 'expired') {
        return { ok: false, code: 'TOKEN_EXPIRED' };
      }

      return { ok: false, code: 'TOKEN_CONSUMED' };
    },

    async consumeToken(tokenId: string): Promise<TokenRecord> {
      if (!repository.consumeById) {
        throw new Error('Token repository does not support consumeById');
      }

      const consumed = await repository.consumeById(
        tokenId,
        now().toISOString(),
      );
      if (!consumed) {
        throw new Error('TOKEN_CONSUMED');
      }

      return consumed;
    },

    async issuePaymentToken(paymentId: string): Promise<{
      token: TokenRecord;
      secret?: string;
      idempotent: boolean;
    }> {
      if (!repository.findByPaymentId || !repository.createMany) {
        throw new Error('Token repository does not support payment token issuance');
      }

      const existing = await repository.findByPaymentId(paymentId);
      if (existing) {
        return { token: existing, idempotent: true };
      }

      const id = createId();
      const secret = createSecret();
      const record: TokenRecord = {
        id,
        secretHash: hashTokenSecret(secret),
        status: 'available',
        paymentId,
        reservedAt: null,
        consumedAt: null,
        createdAt: now().toISOString(),
      };

      try {
        await repository.createMany([record]);
        return { token: record, secret, idempotent: false };
      } catch (error) {
        const concurrent = await repository.findByPaymentId(paymentId);
        if (concurrent) {
          return { token: concurrent, idempotent: true };
        }
        throw error;
      }
    },
  };
}

function isTokenStatus(value: unknown): value is TokenStatus {
  return (
    value === 'available' ||
    value === 'reserved' ||
    value === 'consumed' ||
    value === 'expired'
  );
}

export function createSupabaseTokenRepository(): TokenRepository {
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
    async findBySecretHash(secretHash) {
      // ponytail: single-row select by unique hash; upgrade to RPC when atomic reservation lands in 3.4
      const { data, error } = await client
        .from('tokens')
        .select(
          'id, secret_hash, status, payment_id, reserved_at, consumed_at, created_at',
        )
        .eq('secret_hash', secretHash)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      if (!isTokenStatus(data.status)) {
        throw new Error('Invalid stored token status');
      }

      return {
        id: data.id,
        secretHash: data.secret_hash,
        status: data.status,
        paymentId: data.payment_id,
        reservedAt: data.reserved_at,
        consumedAt: data.consumed_at,
        createdAt: data.created_at,
      };
    },
    async createMany(tokens) {
      if (tokens.length === 0) {
        return;
      }

      const { error } = await client.from('tokens').insert(
        tokens.map((token) => ({
          id: token.id,
          secret_hash: token.secretHash,
          status: token.status,
          payment_id: token.paymentId,
          reserved_at: token.reservedAt,
          consumed_at: token.consumedAt,
          created_at: token.createdAt,
        })),
      );

      if (error) {
        throw error;
      }
    },
    async reserveBySecretHash(
      secretHash,
      reservedAt,
      allowedFromStatuses = ['available'],
    ) {
      const { data, error } = await client
        .from('tokens')
        .update({
          status: 'reserved',
          reserved_at: reservedAt,
        })
        .eq('secret_hash', secretHash)
        .in('status', allowedFromStatuses)
        .select(
          'id, secret_hash, status, payment_id, reserved_at, consumed_at, created_at',
        )
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      if (!isTokenStatus(data.status)) {
        throw new Error('Invalid stored token status');
      }

      return {
        id: data.id,
        secretHash: data.secret_hash,
        status: data.status,
        paymentId: data.payment_id,
        reservedAt: data.reserved_at,
        consumedAt: data.consumed_at,
        createdAt: data.created_at,
      };
    },
    async consumeById(tokenId, consumedAt) {
      const { data, error } = await client
        .from('tokens')
        .update({
          status: 'consumed',
          consumed_at: consumedAt,
        })
        .eq('id', tokenId)
        .in('status', ['available', 'reserved'])
        .select(
          'id, secret_hash, status, payment_id, reserved_at, consumed_at, created_at',
        )
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      if (!isTokenStatus(data.status)) {
        throw new Error('Invalid stored token status');
      }

      return {
        id: data.id,
        secretHash: data.secret_hash,
        status: data.status,
        paymentId: data.payment_id,
        reservedAt: data.reserved_at,
        consumedAt: data.consumed_at,
        createdAt: data.created_at,
      };
    },
    async findByPaymentId(paymentId) {
      const { data, error } = await client
        .from('tokens')
        .select(
          'id, secret_hash, status, payment_id, reserved_at, consumed_at, created_at',
        )
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      if (!isTokenStatus(data.status)) {
        throw new Error('Invalid stored token status');
      }

      return {
        id: data.id,
        secretHash: data.secret_hash,
        status: data.status,
        paymentId: data.payment_id,
        reservedAt: data.reserved_at,
        consumedAt: data.consumed_at,
        createdAt: data.created_at,
      };
    },
  };
}

export function createSupabaseTokenService() {
  if (canUseLocalDevFallback()) {
    return createTokenService(createInMemoryTokenRepository());
  }
  return createTokenService(createSupabaseTokenRepository());
}
