import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeMidtransSignature,
  createMidtransService,
  createMidtransSnapProvider,
  createMidtransStatusProvider,
  PACKAGE_PRICE_IDR,
  type PaymentRecord,
  type PaymentRepository,
} from '../../src/server/payments/midtrans.service';

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

describe('Midtrans Snap provider & service extension (Tasks 1.1–1.5)', () => {
  beforeEach(() => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', 'SB-Mid-server-test-key');
    vi.stubEnv('MIDTRANS_IS_PRODUCTION', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('calls Midtrans Sandbox Snap API with enabled_payments restricted to gopay and qris and returns snapToken and redirectUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'snap-token-sandbox-123',
          redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-sandbox-123',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const provider = createMidtransSnapProvider(fetchMock as unknown as typeof fetch);
    const result = await provider.createSnapTransaction({
      orderId: 'flicks-order-1',
      grossAmount: PACKAGE_PRICE_IDR,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    const expectedAuth = Buffer.from('SB-Mid-server-test-key:').toString('base64');
    expect(headers.authorization).toBe(`Basic ${expectedAuth}`);
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      transaction_details: {
        order_id: 'flicks-order-1',
        gross_amount: 19000,
      },
      enabled_payments: ['gopay', 'qris'],
      item_details: [
        {
          id: 'flicks-lite-pack',
          price: 19000,
          quantity: 1,
        },
      ],
    });

    expect(result).toEqual({
      providerReference: 'flicks-order-1',
      snapToken: 'snap-token-sandbox-123',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-sandbox-123',
    });
  });

  it('uses Midtrans Production Snap URL when MIDTRANS_IS_PRODUCTION is true', async () => {
    vi.stubEnv('MIDTRANS_IS_PRODUCTION', 'true');
    vi.stubEnv('MIDTRANS_SERVER_KEY', 'Mid-server-prod-key');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'snap-token-prod-123',
          redirect_url: 'https://app.midtrans.com/snap/v2/vtweb/snap-token-prod-123',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const provider = createMidtransSnapProvider(fetchMock as unknown as typeof fetch);
    await provider.createSnapTransaction({
      orderId: 'flicks-prod-1',
      grossAmount: PACKAGE_PRICE_IDR,
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.midtrans.com/snap/v1/transactions');
  });

  it('rejects unsupported payment channels and invalid Snap responses', async () => {
    const fetchMock = vi.fn();
    const provider = createMidtransSnapProvider(fetchMock as unknown as typeof fetch);

    await expect(
      provider.createSnapTransaction({
        orderId: 'flicks-bad-channel',
        grossAmount: PACKAGE_PRICE_IDR,
        enabledPayments: ['bank_transfer' as never],
      }),
    ).rejects.toThrow(/unsupported/i);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error_messages: ['Unauthorized'] }), {
        status: 401,
      }),
    );
    await expect(
      provider.createSnapTransaction({
        orderId: 'flicks-http-error',
        grossAmount: PACKAGE_PRICE_IDR,
      }),
    ).rejects.toThrow(/401/);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: '' }), { status: 201 }),
    );
    await expect(
      provider.createSnapTransaction({
        orderId: 'flicks-empty-token',
        grossAmount: PACKAGE_PRICE_IDR,
      }),
    ).rejects.toThrow(/token/i);
  });

  it('createSnapTransaction() persists a Rp19.000 pending payment restricted to gopay/qris, returns snapToken and redirectUrl, and integrates with webhook token issuance', async () => {
    const repo = createInMemoryPaymentRepo();
    const snapProviderMock = {
      createSnapTransaction: vi.fn().mockResolvedValue({
        providerReference: 'flicks-pay-snap-1',
        snapToken: 'snap-tok-1',
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-tok-1',
      }),
    };
    const issuePaymentToken = vi.fn().mockResolvedValue({
      token: { id: 'tok-1' },
      secret: 'secret-1',
      idempotent: false,
    });

    const service = createMidtransService(
      repo,
      { issuePaymentToken: issuePaymentToken as never },
      {
        createId: () => 'pay-snap-1',
        now: () => new Date('2026-10-26T00:00:00.000Z'),
        serverKey: 'SB-Mid-server-test-key',
        snapProvider: snapProviderMock,
      },
    );

    const created = await service.createSnapTransaction();

    expect(snapProviderMock.createSnapTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'flicks-pay-snap-1',
        grossAmount: 19000,
        enabledPayments: ['gopay', 'qris'],
        itemDetails: [
          expect.objectContaining({
            id: 'flicks-lite-pack',
            price: 19000,
            quantity: 1,
          }),
        ],
      }),
    );

    expect(created).toMatchObject({
      id: 'pay-snap-1',
      provider: 'midtrans',
      providerReference: 'flicks-pay-snap-1',
      amount: 19000,
      currency: 'IDR',
      status: 'pending',
      snapToken: 'snap-tok-1',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-tok-1',
    });

    const persisted = await repo.findById('pay-snap-1');
    expect(persisted).toMatchObject({
      id: 'pay-snap-1',
      providerReference: 'flicks-pay-snap-1',
      amount: 19000,
      status: 'pending',
    });

    const signature = computeMidtransSignature({
      orderId: 'flicks-pay-snap-1',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'SB-Mid-server-test-key',
    });

    const notificationResult = await service.handleNotification({
      order_id: 'flicks-pay-snap-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: signature,
    });

    expect(notificationResult).toMatchObject({
      ok: true,
      tokenId: 'tok-1',
      idempotent: false,
    });
  });

  it('verifies webhooks against MIDTRANS_SIGNATURE_KEY when configured and falls back to MIDTRANS_SERVER_KEY when unset', async () => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', 'SB-Mid-server-only');
    vi.stubEnv('MIDTRANS_SIGNATURE_KEY', 'custom-signature-secret-key');

    const repo = createInMemoryPaymentRepo();
    await repo.create({
      id: 'pay-sig-1',
      provider: 'midtrans',
      providerReference: 'flicks-pay-sig-1',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
      qrisUrl: null,
      paidAt: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    });

    const issuePaymentToken = vi.fn().mockResolvedValue({
      token: { id: 'tok-sig-1' },
      secret: 'sec-sig-1',
      idempotent: false,
    });

    const service = createMidtransService(repo, {
      issuePaymentToken: issuePaymentToken as never,
    });

    const signedWithServerKey = computeMidtransSignature({
      orderId: 'flicks-pay-sig-1',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'SB-Mid-server-only',
    });
    const wrongOutcome = await service.handleNotification({
      order_id: 'flicks-pay-sig-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: signedWithServerKey,
    });
    expect(wrongOutcome).toEqual({ ok: false, code: 'INVALID_SIGNATURE' });

    const signedWithSignatureKey = computeMidtransSignature({
      orderId: 'flicks-pay-sig-1',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'custom-signature-secret-key',
    });
    const okOutcome = await service.handleNotification({
      order_id: 'flicks-pay-sig-1',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: signedWithSignatureKey,
    });
    expect(okOutcome).toMatchObject({
      ok: true,
      tokenId: 'tok-sig-1',
    });

    vi.stubEnv('MIDTRANS_SIGNATURE_KEY', '');
    await repo.create({
      id: 'pay-sig-2',
      provider: 'midtrans',
      providerReference: 'flicks-pay-sig-2',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
      qrisUrl: null,
      paidAt: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    });
    const fallbackSig = computeMidtransSignature({
      orderId: 'flicks-pay-sig-2',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'SB-Mid-server-only',
    });
    const fallbackOutcome = await service.handleNotification({
      order_id: 'flicks-pay-sig-2',
      status_code: '200',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      signature_key: fallbackSig,
    });
    expect(fallbackOutcome).toMatchObject({ ok: true });
  });

  it('createMidtransStatusProvider queries /v2/{orderId}/status and returns null for HTTP 200 status_code 404 or HTTP errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: '200',
            order_id: 'flicks-order-settled',
            gross_amount: '19000.00',
            transaction_status: 'settlement',
            fraud_status: 'accept',
            signature_key: 'sig-abc',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: '404',
            status_message: "Transaction doesn't exist.",
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    const provider = createMidtransStatusProvider(
      fetchMock as unknown as typeof fetch,
    );

    const settled = await provider.getTransactionStatus('flicks-order-settled');
    expect(settled).toEqual({
      status_code: '200',
      order_id: 'flicks-order-settled',
      gross_amount: '19000.00',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: 'sig-abc',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.sandbox.midtrans.com/v2/flicks-order-settled/status',
    );
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toBe(`Basic ${Buffer.from('SB-Mid-server-test-key:').toString('base64')}`);

    const notInitiated = await provider.getTransactionStatus(
      'flicks-order-unopened',
    );
    expect(notInitiated).toBeNull();

    const httpErr = await provider.getTransactionStatus('flicks-order-err');
    expect(httpErr).toBeNull();
  });

  it('getVerifiedPaymentWithToken reconciles pending payments via statusProvider and handles transient provider failures', async () => {
    const repo = createInMemoryPaymentRepo();
    await repo.create({
      id: 'pay-reconcile',
      provider: 'midtrans',
      providerReference: 'flicks-pay-reconcile',
      amount: PACKAGE_PRICE_IDR,
      currency: 'IDR',
      status: 'pending',
      qrisUrl: null,
      paidAt: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    });

    const issuePaymentToken = vi.fn().mockResolvedValue({
      token: { id: 'tok-rec-1' },
      secret: 'sec-rec-1',
      idempotent: false,
    });

    const validSignature = computeMidtransSignature({
      orderId: 'flicks-pay-reconcile',
      statusCode: '200',
      grossAmount: '19000.00',
      serverKey: 'SB-Mid-sig-reconcile',
    });

    const statusProvider = {
      getTransactionStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({
          order_id: 'flicks-pay-reconcile',
          status_code: '200',
          gross_amount: '19000.00',
          transaction_status: 'settlement',
          signature_key: validSignature,
        }),
    };

    const service = createMidtransService(
      repo,
      { issuePaymentToken: issuePaymentToken as never },
      {
        signatureKey: 'SB-Mid-sig-reconcile',
        statusProvider,
      },
    );

    const duringNetworkOutage =
      await service.getVerifiedPaymentWithToken('pay-reconcile');
    expect(duringNetworkOutage).toMatchObject({
      payment: { id: 'pay-reconcile', status: 'pending' },
      tokenId: null,
      tokenSecret: null,
    });

    const afterSettlement =
      await service.getVerifiedPaymentWithToken('pay-reconcile');
    expect(afterSettlement).toMatchObject({
      payment: { id: 'pay-reconcile', status: 'paid' },
      tokenId: 'tok-rec-1',
      tokenSecret: 'sec-rec-1',
    });
  });
});
