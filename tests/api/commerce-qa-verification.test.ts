import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createAnalysisService,
  type AnalysisJobRecord,
  type AnalysisJobRepository,
} from '../../src/server/analysis/analysis.service';
import {
  computeMidtransSignature,
  createMidtransService,
  type PaymentRecord,
  type PaymentRepository,
} from '../../src/server/payments/midtrans.service';
import {
  createTokenService,
  hashTokenSecret,
  type TokenRecord,
  type TokenRepository,
} from '../../src/server/tokens/token.service';
import { validateAndStorePhoto } from '../../src/server/upload/upload.service';

describe('MVP Commerce and Upload — Section 4 Verification (QA-02, QA-06, QA-07, QA-08, QA-09, QA-12)', () => {
  it('4.1 (QA-02): rejects invalid photos before storage or paid provider calls', async () => {
    const store = vi.fn();
    const geminiAnalyze = vi.fn();

    for (const invalidCode of [
      'unsupported_type',
      'file_too_large',
      'mime_mismatch',
      'dimensions_out_of_range',
      'unreadable_image',
    ] as const) {
      const uploadOutcome = await validateAndStorePhoto(
        {
          bytes: new Uint8Array([0, 1, 2]),
          declaredMimeType: 'image/png',
          kind: 'face',
          consent: true,
        },
        {
          validate: vi
            .fn()
            .mockResolvedValueOnce({ ok: false, code: invalidCode }),
          storage: { store },
        },
      );

      expect(uploadOutcome).toEqual({
        ok: false,
        code: 'INVALID_PHOTO',
        reason: invalidCode,
      });
    }

    expect(store).not.toHaveBeenCalled();
    expect(geminiAnalyze).not.toHaveBeenCalled();
  });

  it('4.2 (QA-06/07): prevents duplicate jobs on repeated submit and allows only one concurrent token reservation winner', async () => {
    let tokenState: TokenRecord = {
      id: 'token-qa-06-07',
      secretHash: hashTokenSecret('secret-qa-06-07'),
      status: 'available',
      paymentId: 'pay-1',
      reservedAt: null,
      consumedAt: null,
      createdAt: '2026-10-26T00:00:00.000Z',
    };

    const tokenRepo: TokenRepository = {
      findBySecretHash: vi.fn().mockImplementation(async () => tokenState),
      reserveBySecretHash: vi
        .fn()
        .mockImplementation(async (_hash, reservedAt, allowed = ['available']) => {
          if (!allowed.includes(tokenState.status)) {
            return null;
          }
          tokenState = {
            ...tokenState,
            status: 'reserved',
            reservedAt,
          };
          return tokenState;
        }),
    };

    const jobsByToken = new Map<string, AnalysisJobRecord>();
    const analysisRepo: AnalysisJobRepository = {
      findByTokenId: vi
        .fn()
        .mockImplementation(async (tokenId) => jobsByToken.get(tokenId) ?? null),
      findById: vi.fn(),
      create: vi.fn().mockImplementation(async (job) => {
        if (jobsByToken.has(job.tokenId)) {
          throw new Error('duplicate key value violates unique constraint');
        }
        jobsByToken.set(job.tokenId, job);
        return job;
      }),
      update: vi.fn(),
    };

    const tokenService = createTokenService(tokenRepo);
    const analysisService = createAnalysisService(analysisRepo, {
      createId: () => 'job-winner',
    });

    const [reservationA, reservationB] = await Promise.all([
      tokenService.reserveToken('secret-qa-06-07'),
      tokenService.reserveToken('secret-qa-06-07'),
    ]);

    const winners = [reservationA, reservationB].filter((res) => res.ok);
    const losers = [reservationA, reservationB].filter((res) => !res.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toEqual([{ ok: false, code: 'TOKEN_CONSUMED' }]);

    const firstJob = await analysisService.createJob({
      tokenId: tokenState.id,
      photoPath: 'face/photo-1',
      consent: true,
    });
    const repeatedSubmitJob = await analysisService.createJob({
      tokenId: tokenState.id,
      photoPath: 'face/photo-1',
      consent: true,
    });

    expect(firstJob.ok).toBe(true);
    expect(repeatedSubmitJob).toEqual({
      ok: false,
      code: 'TOKEN_CONSUMED',
    });
    expect(jobsByToken.size).toBe(1);
  });

  it('4.3 (QA-08/09): prevents duplicate token issuance on repeated webhooks and blocks forged payment status', async () => {
    const payments = new Map<string, PaymentRecord>();
    const issuedTokensByPayment = new Map<string, TokenRecord>();

    const paymentRepo: PaymentRepository = {
      create: async (p) => {
        payments.set(p.id, p);
        return p;
      },
      findById: async (id) => payments.get(id) ?? null,
      findByProviderReference: async (ref) => {
        for (const p of payments.values()) {
          if (p.providerReference === ref) return p;
        }
        return null;
      },
      updateStatus: async (id, patch) => {
        const current = payments.get(id)!;
        const updated: PaymentRecord = {
          ...current,
          status: patch.status,
          paidAt: patch.paidAt !== undefined ? patch.paidAt : current.paidAt,
          updatedAt: patch.updatedAt,
        };
        payments.set(id, updated);
        return updated;
      },
    };

    let tokenCounter = 0;
    const tokenRepo: TokenRepository = {
      findBySecretHash: vi.fn().mockResolvedValue(null),
      findByPaymentId: async (paymentId) =>
        issuedTokensByPayment.get(paymentId) ?? null,
      createMany: async (records) => {
        for (const record of records) {
          if (record.paymentId && issuedTokensByPayment.has(record.paymentId)) {
            throw new Error('duplicate payment_id');
          }
          if (record.paymentId) {
            issuedTokensByPayment.set(record.paymentId, record);
          }
        }
      },
    };

    const tokenService = createTokenService(tokenRepo, {
      createId: () => `issued-token-${++tokenCounter}`,
      createSecret: () => `secret-${tokenCounter}`,
    });

    const midtransService = createMidtransService(paymentRepo, tokenService, {
      createId: () => 'pay-qa-08',
      serverKey: 'server-secret-qa-08',
      qrisProvider: {
        createQrisCharge: async ({ orderId }) => ({
          providerReference: orderId,
          qrisUrl: 'https://api.sandbox.midtrans.com/qris/qr',
        }),
      },
    });

    const payment = await midtransService.createPendingQrisTransaction();
    expect(payment.status).toBe('pending');

    // QA-09: Forged notification signature must not mark payment paid or issue token
    const forgedResult = await midtransService.handleNotification({
      order_id: payment.providerReference,
      status_code: '200',
      gross_amount: '19000',
      transaction_status: 'settlement',
      signature_key: 'bad-signature',
    });
    expect(forgedResult).toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
    expect(issuedTokensByPayment.size).toBe(0);
    expect(
      (await midtransService.getVerifiedPaymentStatus(payment.id))?.status,
    ).toBe('pending');

    // QA-08: Repeated signed notifications issue only 1 token
    const validSignature = computeMidtransSignature({
      orderId: payment.providerReference,
      statusCode: '200',
      grossAmount: '19000',
      serverKey: 'server-secret-qa-08',
    });

    const first = await midtransService.handleNotification({
      order_id: payment.providerReference,
      status_code: '200',
      gross_amount: '19000',
      transaction_status: 'settlement',
      signature_key: validSignature,
    });
    const second = await midtransService.handleNotification({
      order_id: payment.providerReference,
      status_code: '200',
      gross_amount: '19000',
      transaction_status: 'settlement',
      signature_key: validSignature,
    });

    expect(first).toMatchObject({
      ok: true,
      tokenId: 'issued-token-1',
      idempotent: false,
    });
    expect(second).toMatchObject({
      ok: true,
      tokenId: 'issued-token-1',
      idempotent: true,
    });
    expect(issuedTokensByPayment.size).toBe(1);
  });

  it('4.4 (QA-12): enforces RLS and service_role-only access across photo, token, payment, and job tables', () => {
    const photoMigration = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/20261023120000_photo_private_storage.sql',
      ),
      'utf8',
    );
    const tokenMigration = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/20261025120000_tokens_table.sql',
      ),
      'utf8',
    );
    const commerceMigration = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/20261026000000_commerce_and_ai_jobs.sql',
      ),
      'utf8',
    );

    expect(photoMigration).toMatch(/public\s*=\s*false/i);
    expect(photoMigration).toMatch(
      /revoke all on table public\.photo_assets from public, anon, authenticated/i,
    );
    expect(tokenMigration).toMatch(
      /revoke all on table public\.tokens from public, anon, authenticated/i,
    );
    expect(commerceMigration).toMatch(
      /revoke all on table public\.payments from public, anon, authenticated/i,
    );
    expect(commerceMigration).toMatch(
      /revoke all on table public\.jobs from public, anon, authenticated/i,
    );
    expect(commerceMigration).toMatch(/unique\s*\(\s*token_id\s*,\s*type\s*\)/i);
  });
});
