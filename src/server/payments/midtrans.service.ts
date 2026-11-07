import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getRequiredEnv } from '@/server/env';
import { recordOperationalEvent } from '@/server/monitoring/monitor';
import {
  createSupabaseTokenService,
  type TokenRecord,
} from '@/server/tokens/token.service';

export const PACKAGE_PRICE_IDR = 19000;
export const PACKAGE_CURRENCY = 'IDR';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded';

export interface PaymentRecord {
  id: string;
  provider: 'midtrans';
  providerReference: string;
  amount: number;
  currency: 'IDR';
  status: PaymentStatus;
  qrisUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRepository {
  create(payment: PaymentRecord): Promise<PaymentRecord>;
  findById(paymentId: string): Promise<PaymentRecord | null>;
  findByProviderReference(
    providerReference: string,
  ): Promise<PaymentRecord | null>;
  updateStatus(
    paymentId: string,
    patch: {
      status: PaymentStatus;
      paidAt?: string | null;
      updatedAt: string;
    },
  ): Promise<PaymentRecord>;
}

export interface MidtransQrisProvider {
  createQrisCharge(input: {
    orderId: string;
    grossAmount: number;
  }): Promise<{
    providerReference: string;
    qrisUrl: string | null;
  }>;
}

export interface MidtransNotificationPayload {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
}

export interface PaymentTokenIssuer {
  issuePaymentToken(paymentId: string): Promise<{
    token: TokenRecord;
    secret?: string;
    idempotent: boolean;
  }>;
}

export interface MidtransServiceOptions {
  createId?: () => string;
  now?: () => Date;
  serverKey?: string;
  qrisProvider?: MidtransQrisProvider;
}

export function computeMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  return createHash('sha512')
    .update(
      `${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`,
      'utf8',
    )
    .digest('hex');
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  signatureKey: string;
}): boolean {
  if (
    !input.orderId ||
    !input.statusCode ||
    !input.grossAmount ||
    !input.serverKey?.trim() ||
    !input.signatureKey?.trim()
  ) {
    return false;
  }

  const expected = Buffer.from(
    computeMidtransSignature({
      orderId: input.orderId,
      statusCode: input.statusCode,
      grossAmount: input.grossAmount,
      serverKey: input.serverKey,
    }),
    'utf8',
  );
  const provided = Buffer.from(input.signatureKey.trim().toLowerCase(), 'utf8');

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export function mapMidtransStatus(
  transactionStatus: string | undefined,
  fraudStatus?: string,
): PaymentStatus {
  switch (transactionStatus) {
    case 'settlement':
      return 'paid';
    case 'capture':
      return fraudStatus && fraudStatus !== 'accept' ? 'failed' : 'paid';
    case 'pending':
      return 'pending';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'partial_refund':
      return 'refunded';
    case 'deny':
    case 'cancel':
    case 'failure':
    default:
      return 'failed';
  }
}

export function createMidtransRestProvider(
  fetchImpl: typeof fetch = fetch,
): MidtransQrisProvider {
  return {
    async createQrisCharge(input) {
      const serverKey = getRequiredEnv('MIDTRANS_SERVER_KEY');
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
      const baseUrl = isProduction
        ? 'https://api.midtrans.com'
        : 'https://api.sandbox.midtrans.com';
      const basicAuth = Buffer.from(`${serverKey}:`).toString('base64');

      const response = await fetchImpl(`${baseUrl}/v2/charge`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          payment_type: 'qris',
          transaction_details: {
            order_id: input.orderId,
            gross_amount: input.grossAmount,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Midtrans charge failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        order_id?: string;
        actions?: Array<{ name?: string; url?: string }>;
      };

      const qrisAction = payload.actions?.find(
        (action) =>
          action.name === 'generate-qr-code' || typeof action.url === 'string',
      );

      return {
        providerReference: payload.order_id || input.orderId,
        qrisUrl: qrisAction?.url ?? null,
      };
    },
  };
}

export function createMidtransService(
  repository: PaymentRepository,
  tokenIssuer: PaymentTokenIssuer,
  options: MidtransServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return {
    async createPendingQrisTransaction(): Promise<PaymentRecord> {
      const id = createId();
      const orderId = `flicks-${id}`;
      const qrisProvider =
        options.qrisProvider ?? createMidtransRestProvider();

      const charge = await qrisProvider.createQrisCharge({
        orderId,
        grossAmount: PACKAGE_PRICE_IDR,
      });

      const timestamp = now().toISOString();
      const payment: PaymentRecord = {
        id,
        provider: 'midtrans',
        providerReference: charge.providerReference,
        amount: PACKAGE_PRICE_IDR,
        currency: PACKAGE_CURRENCY,
        status: 'pending',
        qrisUrl: charge.qrisUrl,
        paidAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return await repository.create(payment);
    },

    async handleNotification(notification: MidtransNotificationPayload): Promise<
      | {
          ok: true;
          payment: PaymentRecord;
          tokenId: string | null;
          idempotent: boolean;
        }
      | {
          ok: false;
          code: 'INVALID_SIGNATURE' | 'PAYMENT_NOT_FOUND' | 'INVALID_AMOUNT';
        }
    > {
      const serverKey =
        options.serverKey ?? getRequiredEnv('MIDTRANS_SERVER_KEY');
      const orderId = notification.order_id?.trim() ?? '';
      const statusCode = notification.status_code?.trim() ?? '';
      const grossAmount = notification.gross_amount?.trim() ?? '';
      const signatureKey = notification.signature_key?.trim() ?? '';

      if (
        !verifyMidtransSignature({
          orderId,
          statusCode,
          grossAmount,
          serverKey,
          signatureKey,
        })
      ) {
        recordOperationalEvent({
          category: 'payment_failure',
          severity: 'warn',
          code: 'INVALID_SIGNATURE',
          message: 'Rejected Midtrans webhook with invalid signature',
          metadata: { orderId },
        });
        return { ok: false, code: 'INVALID_SIGNATURE' };
      }

      const existing = await repository.findByProviderReference(orderId);
      if (!existing) {
        recordOperationalEvent({
          category: 'payment_failure',
          severity: 'warn',
          code: 'PAYMENT_NOT_FOUND',
          message: 'Midtrans webhook referenced unknown orderId',
          metadata: { orderId },
        });
        return { ok: false, code: 'PAYMENT_NOT_FOUND' };
      }

      const parsedAmount = Number(grossAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount !== existing.amount) {
        recordOperationalEvent({
          category: 'payment_failure',
          severity: 'error',
          code: 'INVALID_AMOUNT',
          message: 'Midtrans webhook amount mismatch',
          metadata: { orderId, expectedAmount: existing.amount },
        });
        return { ok: false, code: 'INVALID_AMOUNT' };
      }

      const nextStatus = mapMidtransStatus(
        notification.transaction_status,
        notification.fraud_status,
      );

      if (nextStatus === 'failed' || nextStatus === 'expired') {
        recordOperationalEvent({
          category: 'payment_failure',
          severity: 'warn',
          code: `PAYMENT_${nextStatus.toUpperCase()}`,
          message: `Payment transitioned to ${nextStatus}`,
          metadata: { orderId, paymentId: existing.id, status: nextStatus },
        });
      }

      if (existing.status === 'paid' && nextStatus === 'paid') {
        const issued = await tokenIssuer.issuePaymentToken(existing.id);
        return {
          ok: true,
          payment: existing,
          tokenId: issued.token.id,
          idempotent: true,
        };
      }

      const timestamp = now().toISOString();
      const updated = await repository.updateStatus(existing.id, {
        status: nextStatus,
        paidAt: nextStatus === 'paid' ? existing.paidAt ?? timestamp : existing.paidAt,
        updatedAt: timestamp,
      });

      if (nextStatus === 'paid') {
        const issued = await tokenIssuer.issuePaymentToken(updated.id);
        return {
          ok: true,
          payment: updated,
          tokenId: issued.token.id,
          idempotent: issued.idempotent,
        };
      }

      return {
        ok: true,
        payment: updated,
        tokenId: null,
        idempotent: false,
      };
    },

    async getVerifiedPaymentStatus(
      paymentId: string,
    ): Promise<PaymentRecord | null> {
      return await repository.findById(paymentId);
    },
  };
}

function mapRowToPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    provider: 'midtrans',
    providerReference: String(row.provider_reference),
    amount: Number(row.amount),
    currency: 'IDR',
    status: row.status as PaymentStatus,
    qrisUrl: (row.qris_url as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createSupabasePaymentRepository(): PaymentRepository {
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
    async create(payment) {
      const { data, error } = await client
        .from('payments')
        .insert({
          id: payment.id,
          provider: payment.provider,
          provider_reference: payment.providerReference,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          qris_url: payment.qrisUrl,
          paid_at: payment.paidAt,
          created_at: payment.createdAt,
          updated_at: payment.updatedAt,
        })
        .select(
          'id, provider, provider_reference, amount, currency, status, qris_url, paid_at, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToPayment(data);
    },
    async findById(paymentId) {
      const { data, error } = await client
        .from('payments')
        .select(
          'id, provider, provider_reference, amount, currency, status, qris_url, paid_at, created_at, updated_at',
        )
        .eq('id', paymentId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToPayment(data) : null;
    },
    async findByProviderReference(providerReference) {
      const { data, error } = await client
        .from('payments')
        .select(
          'id, provider, provider_reference, amount, currency, status, qris_url, paid_at, created_at, updated_at',
        )
        .eq('provider_reference', providerReference)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data ? mapRowToPayment(data) : null;
    },
    async updateStatus(paymentId, patch) {
      const { data, error } = await client
        .from('payments')
        .update({
          status: patch.status,
          ...(patch.paidAt !== undefined ? { paid_at: patch.paidAt } : {}),
          updated_at: patch.updatedAt,
        })
        .eq('id', paymentId)
        .select(
          'id, provider, provider_reference, amount, currency, status, qris_url, paid_at, created_at, updated_at',
        )
        .single();

      if (error) {
        throw error;
      }
      return mapRowToPayment(data);
    },
  };
}

export function createSupabaseMidtransService(
  options: MidtransServiceOptions = {},
) {
  return createMidtransService(
    createSupabasePaymentRepository(),
    createSupabaseTokenService(),
    options,
  );
}
