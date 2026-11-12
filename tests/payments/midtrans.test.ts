import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeMidtransSignature,
  createMidtransService,
  PACKAGE_PRICE_IDR,
  type PaymentRecord,
  type PaymentRepository,
} from '../../src/server/payments/midtrans.service';

const { createSupabaseMidtransService } = vi.hoisted(() => ({
  createSupabaseMidtransService: vi.fn(),
}));

vi.mock('../../src/server/payments/midtrans.service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/server/payments/midtrans.service')
    >();
  return {
    ...actual,
    createSupabaseMidtransService,
  };
});

import { POST as checkoutPOST } from '../../src/app/api/checkout/route';
import { GET as paymentStatusGET } from '../../src/app/api/payments/[paymentId]/route';
import { POST as webhookPOST } from '../../src/app/api/webhooks/midtrans/route';

function createInMemoryPaymentRepo(): PaymentRepository {
  const payments = new Map<string, PaymentRecord>();
  return {
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
      if (!existing) throw new Error('Payment not found');
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
}

describe('Midtrans QRIS checkout, webhook verification, and status (Tasks 1.2–1.5, QA-08/09)', () => {
  it('creates a pending Rp19.000 QRIS payment, verifies webhook signature, and issues exactly one token across duplicate notifications (1.2, 1.3, 1.4, QA-08/09)', async () => {
    const repo = createInMemoryPaymentRepo();
    const issuedByPayment = new Map<string, string>();
    const issuePaymentToken = vi.fn().mockImplementation(async (paymentId: string) => {
      if (issuedByPayment.has(paymentId)) {
        return {
          token: { id: issuedByPayment.get(paymentId)! },
          idempotent: true,
        };
      }
      const tokenId = `token-for-${paymentId}`;
      issuedByPayment.set(paymentId, tokenId);
      return {
        token: { id: tokenId },
        secret: 'issued-secret',
        idempotent: false,
      };
    });

    const service = createMidtransService(
      repo,
      { issuePaymentToken: issuePaymentToken as never },
      {
        createId: () => 'pay-1',
        now: () => new Date('2026-10-25T17:00:00.000Z'),
        serverKey: 'midtrans-server-secret',
        qrisProvider: {
          createQrisCharge: vi.fn().mockResolvedValue({
            providerReference: 'flicks-pay-1',
            qrisUrl: 'https://api.sandbox.midtrans.com/v2/qris/flicks-pay-1/qr-code',
          }),
        },
      },
    );

    const created = await service.createPendingQrisTransaction();
    expect(created).toMatchObject({
      id: 'pay-1',
      providerReference: 'flicks-pay-1',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
    });

    const forged = await service.handleNotification({
      order_id: 'flicks-pay-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: 'forged-signature',
    });
    expect(forged).toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
    expect(issuePaymentToken).not.toHaveBeenCalled();

    const validSignature = computeMidtransSignature({
      orderId: 'flicks-pay-1',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'midtrans-server-secret',
    });

    const firstWebhook = await service.handleNotification({
      order_id: 'flicks-pay-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: validSignature,
    });
    expect(firstWebhook).toMatchObject({
      ok: true,
      tokenId: 'token-for-pay-1',
      idempotent: false,
    });

    const duplicateWebhook = await service.handleNotification({
      order_id: 'flicks-pay-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: validSignature,
    });
    expect(duplicateWebhook).toMatchObject({
      ok: true,
      tokenId: 'token-for-pay-1',
      idempotent: true,
    });
    expect(issuedByPayment.size).toBe(1);
  });

  describe('Checkout, Webhook, and Status API routes (1.2–1.5)', () => {
    const createSnapTransaction = vi.fn();
    const handleNotification = vi.fn();
    const getVerifiedPaymentWithToken = vi.fn();

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
      vi.stubEnv('MIDTRANS_SERVER_KEY', 'midtrans-server-secret');
      createSnapTransaction.mockReset();
      handleNotification.mockReset();
      getVerifiedPaymentWithToken.mockReset();
      createSupabaseMidtransService.mockReturnValue({
        createSnapTransaction,
        handleNotification,
        getVerifiedPaymentWithToken,
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('creates pending Snap checkout and returns verified server payment status ignoring client status params (1.2, 1.5, QA-09)', async () => {
      createSnapTransaction.mockResolvedValueOnce({
        id: 'pay-1',
        providerReference: 'flicks-pay-1',
        amount: 19000,
        currency: 'IDR',
        status: 'pending',
        snapToken: 'snap-tok-1',
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/1',
        qrisUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/1',
        paidAt: null,
      });

      const checkoutRes = await checkoutPOST();
      expect(checkoutRes.status).toBe(201);
      await expect(checkoutRes.json()).resolves.toEqual({
        payment_id: 'pay-1',
        provider_reference: 'flicks-pay-1',
        amount: 19000,
        currency: 'IDR',
        status: 'pending',
        snap_token: 'snap-tok-1',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/1',
        qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/1',
      });

      getVerifiedPaymentWithToken.mockResolvedValueOnce({
        payment: {
          id: 'pay-1',
          providerReference: 'flicks-pay-1',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          paidAt: null,
        },
        tokenId: null,
        tokenSecret: null,
      });

      const statusRes = await paymentStatusGET(
        new Request('http://localhost/api/payments/pay-1?status=paid'),
        { params: Promise.resolve({ paymentId: 'pay-1' }) },
      );
      expect(statusRes.status).toBe(200);
      await expect(statusRes.json()).resolves.toEqual({
        payment_id: 'pay-1',
        provider_reference: 'flicks-pay-1',
        amount: 19000,
        currency: 'IDR',
        status: 'pending',
        paid_at: null,
      });

      handleNotification.mockResolvedValueOnce({
        ok: false,
        code: 'INVALID_SIGNATURE',
      });
      const badWebhookRes = await webhookPOST(
        new Request('http://localhost/api/webhooks/midtrans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: 'flicks-pay-1' }),
        }),
      );
      expect(badWebhookRes.status).toBe(401);
    });

    it('accepts webhook requests when MIDTRANS_SIGNATURE_KEY is configured even without MIDTRANS_SERVER_KEY', async () => {
      vi.stubEnv('MIDTRANS_SERVER_KEY', '');
      vi.stubEnv('MIDTRANS_SIGNATURE_KEY', 'midtrans-signature-secret');

      handleNotification.mockResolvedValueOnce({
        ok: true,
        payment: {
          id: 'pay-sig-route',
          providerReference: 'flicks-pay-sig-route',
          status: 'paid',
        },
        tokenId: 'tok-sig-route',
        idempotent: false,
      });

      const res = await webhookPOST(
        new Request('http://localhost/api/webhooks/midtrans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: 'flicks-pay-sig-route' }),
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        payment_id: 'pay-sig-route',
        status: 'paid',
        token_id: 'tok-sig-route',
      });
    });
  });
});
