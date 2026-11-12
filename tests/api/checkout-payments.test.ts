import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeMidtransSignature,
  createMidtransService,
  PACKAGE_PRICE_IDR,
  type MidtransSnapProvider,
  type PaymentRecord,
  type PaymentRepository,
} from '@/server/payments/midtrans.service';
import {
  createTokenService,
  type TokenRecord,
  type TokenRepository,
} from '@/server/tokens/token.service';

const { createSupabaseMidtransService } = vi.hoisted(() => ({
  createSupabaseMidtransService: vi.fn(),
}));

vi.mock('@/server/payments/midtrans.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/server/payments/midtrans.service')>();
  return {
    ...actual,
    createSupabaseMidtransService,
  };
});

import { POST as checkoutPOST } from '@/app/api/checkout/route';
import { GET as paymentStatusGET } from '@/app/api/payments/[paymentId]/route';
import { POST as webhookPOST } from '@/app/api/webhooks/midtrans/route';

function createInMemoryRepos() {
  const payments = new Map<string, PaymentRecord>();
  const tokensByHash = new Map<string, TokenRecord>();
  const tokensByPaymentId = new Map<string, TokenRecord>();

  const paymentRepo: PaymentRepository = {
    async create(payment) {
      payments.set(payment.id, payment);
      return payment;
    },
    async findById(paymentId) {
      return payments.get(paymentId) ?? null;
    },
    async findByProviderReference(providerReference) {
      for (const payment of payments.values()) {
        if (payment.providerReference === providerReference) {
          return payment;
        }
      }
      return null;
    },
    async updateStatus(paymentId, patch) {
      const existing = payments.get(paymentId);
      if (!existing) {
        throw new Error('Payment not found');
      }
      const updated: PaymentRecord = {
        ...existing,
        status: patch.status,
        paidAt: patch.paidAt !== undefined ? patch.paidAt : existing.paidAt,
        updatedAt: patch.updatedAt,
      };
      payments.set(paymentId, updated);
      return updated;
    },
  };

  const tokenRepo: TokenRepository = {
    async findBySecretHash(secretHash) {
      return tokensByHash.get(secretHash) ?? null;
    },
    async findByPaymentId(paymentId) {
      return tokensByPaymentId.get(paymentId) ?? null;
    },
    async createMany(records) {
      for (const record of records) {
        if (record.paymentId && tokensByPaymentId.has(record.paymentId)) {
          throw new Error('duplicate payment_id');
        }
        tokensByHash.set(record.secretHash, record);
        if (record.paymentId) {
          tokensByPaymentId.set(record.paymentId, record);
        }
      }
    },
    async consumeById(tokenId, consumedAt) {
      for (const [hash, record] of tokensByHash.entries()) {
        if (record.id === tokenId) {
          const updated: TokenRecord = {
            ...record,
            status: 'consumed',
            consumedAt,
          };
          tokensByHash.set(hash, updated);
          if (updated.paymentId) {
            tokensByPaymentId.set(updated.paymentId, updated);
          }
          return updated;
        }
      }
      return null;
    },
  };

  return { payments, tokensByHash, tokensByPaymentId, paymentRepo, tokenRepo };
}

describe('Checkout & Payment Polling API Routes with Token Handover (Section 2)', () => {
  const SERVER_KEY = 'midtrans-server-secret';
  let repos: ReturnType<typeof createInMemoryRepos>;
  let snapProvider: MidtransSnapProvider;
  let paymentSeq = 0;
  let tokenSeq = 0;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'supabase-service-role-secret');
    vi.stubEnv('MIDTRANS_SERVER_KEY', SERVER_KEY);

    repos = createInMemoryRepos();
    paymentSeq = 0;
    tokenSeq = 0;

    snapProvider = {
      createSnapTransaction: vi.fn(async ({ orderId }) => ({
        providerReference: orderId,
        snapToken: `snap-tok-${orderId}`,
        redirectUrl: `https://app.sandbox.midtrans.com/snap/v4/redirection/${orderId}`,
      })),
    };

    createSupabaseMidtransService.mockImplementation(() => {
      const tokenService = createTokenService(repos.tokenRepo, {
        createId: () => `token-${++tokenSeq}`,
        now: () => new Date('2026-11-05T10:00:00.000Z'),
      });
      return createMidtransService(repos.paymentRepo, tokenService, {
        createId: () => `pay-${++paymentSeq}`,
        now: () => new Date('2026-11-05T10:00:00.000Z'),
        serverKey: SERVER_KEY,
        snapProvider,
      });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('POST /api/checkout creates a Snap transaction and returns snap_token and payment_id (2.1, 2.2)', async () => {
    const response = await checkoutPOST();
    expect(response.status).toBe(201);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      payment_id: 'pay-1',
      provider_reference: 'flicks-pay-1',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
      snap_token: 'snap-tok-flicks-pay-1',
      redirect_url:
        'https://app.sandbox.midtrans.com/snap/v4/redirection/flicks-pay-1',
    });

    expect(snapProvider.createSnapTransaction).toHaveBeenCalledWith({
      orderId: 'flicks-pay-1',
      grossAmount: PACKAGE_PRICE_IDR,
      enabledPayments: ['gopay', 'qris'],
      itemDetails: [
        {
          id: 'flicks-lite-pack',
          price: PACKAGE_PRICE_IDR,
          quantity: 1,
          name: 'FLICKS Lite Analysis Pack',
        },
      ],
    });
  });

  it('GET /api/payments/[paymentId] ignores forged client params while pending and returns token_id + usable token_secret once webhook verifies payment (2.1, 2.3, 2.4)', async () => {
    const checkoutRes = await checkoutPOST();
    const { payment_id, provider_reference } = (await checkoutRes.json()) as {
      payment_id: string;
      provider_reference: string;
    };

    const pendingRes = await paymentStatusGET(
      new Request(`http://localhost/api/payments/${payment_id}?status=paid`),
      { params: Promise.resolve({ paymentId: payment_id }) },
    );
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as Record<string, unknown>;
    expect(pendingBody).toEqual({
      payment_id,
      provider_reference,
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
      paid_at: null,
    });
    expect(pendingBody).not.toHaveProperty('token_secret');

    const signature = computeMidtransSignature({
      orderId: provider_reference,
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: SERVER_KEY,
    });

    const webhookRes = await webhookPOST(
      new Request('http://localhost/api/webhooks/midtrans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: provider_reference,
          status_code: '200',
          gross_amount: '19000.00',
          transaction_status: 'settlement',
          signature_key: signature,
        }),
      }),
    );
    expect(webhookRes.status).toBe(200);
    const webhookBody = (await webhookRes.json()) as {
      status: string;
      token_id: string;
      idempotent: boolean;
    };
    expect(webhookBody).toMatchObject({
      status: 'paid',
      token_id: 'token-1',
      idempotent: false,
    });
    expect(webhookBody).not.toHaveProperty('token_secret');

    const paidRes = await paymentStatusGET(
      new Request(`http://localhost/api/payments/${payment_id}`),
      { params: Promise.resolve({ paymentId: payment_id }) },
    );
    expect(paidRes.status).toBe(200);
    const paidBody = (await paidRes.json()) as {
      payment_id: string;
      status: string;
      token_id: string;
      token_secret: string | null;
    };
    expect(paidBody).toMatchObject({
      payment_id,
      provider_reference,
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'paid',
      token_id: 'token-1',
    });
    expect(typeof paidBody.token_secret).toBe('string');
    expect(paidBody.token_secret!.length).toBeGreaterThanOrEqual(32);

    const verification = await createTokenService(repos.tokenRepo).verifyToken(
      paidBody.token_secret,
    );
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.token.id).toBe('token-1');
    }
  });

  it('GET /api/payments/[paymentId] defensively issues one token if payment is paid without a prior token, and suppresses token_secret once consumed (2.3, 2.4)', async () => {
    await repos.paymentRepo.create({
      id: 'pay-delayed-webhook',
      provider: 'midtrans',
      providerReference: 'flicks-pay-delayed-webhook',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'paid',
      qrisUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/delayed',
      paidAt: '2026-11-05T09:59:00.000Z',
      createdAt: '2026-11-05T09:58:00.000Z',
      updatedAt: '2026-11-05T09:59:00.000Z',
    });

    const pollRes = await paymentStatusGET(
      new Request('http://localhost/api/payments/pay-delayed-webhook'),
      { params: Promise.resolve({ paymentId: 'pay-delayed-webhook' }) },
    );
    expect(pollRes.status).toBe(200);
    const pollBody = (await pollRes.json()) as {
      status: string;
      token_id: string;
      token_secret: string | null;
    };
    expect(pollBody.status).toBe('paid');
    expect(pollBody.token_id).toBe('token-1');
    expect(typeof pollBody.token_secret).toBe('string');
    expect(repos.tokensByPaymentId.size).toBe(1);

    const signature = computeMidtransSignature({
      orderId: 'flicks-pay-delayed-webhook',
      statusCode: '200',
      grossAmount: '19000',
      serverKey: SERVER_KEY,
    });
    const lateWebhook = await webhookPOST(
      new Request('http://localhost/api/webhooks/midtrans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: 'flicks-pay-delayed-webhook',
          status_code: '200',
          gross_amount: '19000',
          transaction_status: 'settlement',
          signature_key: signature,
        }),
      }),
    );
    expect(lateWebhook.status).toBe(200);
    await expect(lateWebhook.json()).resolves.toMatchObject({
      token_id: 'token-1',
      idempotent: true,
    });
    expect(repos.tokensByPaymentId.size).toBe(1);

    await createTokenService(repos.tokenRepo).consumeToken('token-1');
    const afterConsumeRes = await paymentStatusGET(
      new Request('http://localhost/api/payments/pay-delayed-webhook'),
      { params: Promise.resolve({ paymentId: 'pay-delayed-webhook' }) },
    );
    expect(afterConsumeRes.status).toBe(200);
    await expect(afterConsumeRes.json()).resolves.toMatchObject({
      payment_id: 'pay-delayed-webhook',
      status: 'paid',
      token_id: 'token-1',
      token_secret: null,
    });
  });

  it('returns 404 when payment is missing and 502 when Snap provider errors (2.1–2.3)', async () => {
    const missingRes = await paymentStatusGET(
      new Request('http://localhost/api/payments/nonexistent'),
      { params: Promise.resolve({ paymentId: 'nonexistent' }) },
    );
    expect(missingRes.status).toBe(404);

    vi.mocked(snapProvider.createSnapTransaction).mockRejectedValueOnce(
      new Error('Midtrans unavailable'),
    );
    const failedCheckoutRes = await checkoutPOST();
    expect(failedCheckoutRes.status).toBe(502);
  });
});
