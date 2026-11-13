import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalDevMemoryState } from '../../src/server/dev/local-memory-store';
import { createSupabaseVirtualTryOnService } from '../../src/server/vto/virtual-try-on.service';
import { GET as getTransactions } from '../../src/app/api/admin/transactions/route';
import { GET as getJobs } from '../../src/app/api/admin/jobs/route';
import {
  GET as getProducts,
  POST as postProduct,
} from '../../src/app/api/admin/products/route';
import {
  PATCH as patchProduct,
  DELETE as deleteProduct,
} from '../../src/app/api/admin/products/[id]/route';
import { GET as getSummary } from '../../src/app/api/admin/summary/route';

describe('Admin API routes (/api/admin/*)', () => {
  beforeEach(() => {
    const state = getLocalDevMemoryState();
    state.adminProfilesByUserId.clear();
    state.paymentsById.clear();
    state.tokensByHash.clear();
    state.analysisJobsById.clear();
    state.vtoJobsById.clear();
    state.usageEvents.length = 0;
    state.productsById.clear();
    state.productsById.set('prod-active-1', {
      id: 'prod-active-1',
      name: 'Terracotta Linen Overshirt',
      brand: 'Flicks Essentials',
      category: 'tops',
      subcategory: 'overshirt',
      imagePath: 'catalog/terracotta-overshirt.jpg',
      sourceUrl: 'https://flicks.example/products/terracotta-overshirt',
      labels: { seasons: ['Warm Autumn'] },
      isActive: true,
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
    });

    state.adminProfilesByUserId.set('admin-1', {
      userId: 'admin-1',
      role: 'admin',
      createdAt: '2026-11-04T00:00:00.000Z',
    });
  });

  it('rejects unauthenticated requests with 401 and non-admin users with 403 across admin endpoints', async () => {
    const unauthRes = await getSummary(
      new Request('http://localhost/api/admin/summary'),
    );
    expect(unauthRes.status).toBe(401);
    const unauthJson = await unauthRes.json();
    expect(unauthJson).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    const forbiddenRes = await getTransactions(
      new Request('http://localhost/api/admin/transactions', {
        headers: { authorization: 'Bearer user:visitor-99' },
      }),
    );
    expect(forbiddenRes.status).toBe(403);
    const forbiddenJson = await forbiddenRes.json();
    expect(forbiddenJson).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('returns transactions with token lifecycle, AI/VTO jobs, and summary cost breakdown for authorized admin', async () => {
    const state = getLocalDevMemoryState();
    state.paymentsById.set('pay-101', {
      id: 'pay-101',
      provider: 'midtrans',
      providerReference: 'flicks-pay-101',
      amount: 14999,
      currency: 'IDR',
      status: 'paid',
      qrisUrl: 'https://midtrans.example/qris/101',
      paidAt: '2026-11-04T11:00:00.000Z',
      createdAt: '2026-11-04T10:59:00.000Z',
      updatedAt: '2026-11-04T11:00:00.000Z',
    });

    state.tokensByHash.set('hash-tok-101', {
      id: 'tok-101',
      secretHash: 'hash-tok-101',
      status: 'consumed',
      paymentId: 'pay-101',
      reservedAt: '2026-11-04T11:01:00.000Z',
      consumedAt: '2026-11-04T11:02:00.000Z',
      createdAt: '2026-11-04T11:00:00.000Z',
    });

    state.analysisJobsById.set('job-ai-101', {
      id: 'job-ai-101',
      tokenId: 'tok-101',
      status: 'completed',
      input: {
        requestHash: 'req-101',
        facePhotoPath: 'photos/face.jpg',
        bodyPhotoPath: 'photos/body.jpg',
      },
      result: {
        season: 'Warm Autumn',
        undertone: 'warm',
        contrast: 'medium',
        bodyShape: 'Inverted Triangle',
        proportionNotes: ['Balanced'],
        palette: ['Terracotta', 'Olive', 'Camel', 'Cream'],
        avoidColors: ['Icy Pink', 'Neon Green'],
        recommendations: {
          tops: 'Relaxed collars',
          bottoms: 'Straight trousers',
          outerwear: 'Unstructured overshirts',
        },
        rationale: 'Warm undertone.',
      },
      provider: 'gemini',
      providerReference: 'gemini-ref-101',
      error: null,
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
      createdAt: '2026-11-04T11:01:00.000Z',
      updatedAt: '2026-11-04T11:01:03.500Z',
    });

    state.usageEvents.push(
      {
        id: 'ue-gemini-101',
        jobId: 'job-ai-101',
        provider: 'gemini',
        feature: 'personal_color',
        model: 'gemini-2.5-flash',
        inputTokens: 1100,
        outputTokens: 320,
        estimatedCostIdr: 410,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T11:01:03.500Z',
      },
      {
        id: 'ue-fashn-101',
        jobId: 'job-vto-101',
        provider: 'fashn',
        feature: 'virtual_try_on',
        model: 'tryon-v1.6',
        inputTokens: null,
        outputTokens: null,
        estimatedCostIdr: 1200,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T11:02:10.000Z',
      },
    );

    const authHeaders = { authorization: 'Bearer admin-1' };

    const txRes = await getTransactions(
      new Request('http://localhost/api/admin/transactions', {
        headers: authHeaders,
      }),
    );
    expect(txRes.status).toBe(200);
    const txJson = await txRes.json();
    expect(txJson.ok).toBe(true);
    expect(txJson.transactions).toHaveLength(1);
    expect(txJson.transactions[0].token.status).toBe('consumed');
    expect(txJson.tokens).toHaveLength(1);

    const jobsRes = await getJobs(
      new Request('http://localhost/api/admin/jobs', {
        headers: authHeaders,
      }),
    );
    expect(jobsRes.status).toBe(200);
    const jobsJson = await jobsRes.json();
    expect(jobsJson.ok).toBe(true);
    expect(jobsJson.jobs).toHaveLength(1);
    expect(jobsJson.jobs[0].providerReference).toBe('gemini-ref-101');
    expect(jobsJson.jobs[0].durationMs).toBe(3500);

    const summaryRes = await getSummary(
      new Request('http://localhost/api/admin/summary', {
        headers: authHeaders,
      }),
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = await summaryRes.json();
    expect(summaryJson.ok).toBe(true);
    expect(summaryJson.summary.transactions.totalRevenueIdr).toBe(14999);
    expect(summaryJson.summary.costs.geminiEstimatedIdr).toBe(410);
    expect(summaryJson.summary.costs.fashnActualIdr).toBe(1200);
    expect(summaryJson.summary.costs.totalCostIdr).toBe(1610);
  });

  it('creates, updates, and soft-deactivates products, blocking inactive products from new VTO jobs', async () => {
    const authHeaders = {
      authorization: 'Bearer admin-1',
      'content-type': 'application/json',
    };

    const createRes = await postProduct(
      new Request('http://localhost/api/admin/products', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Olive Pleated Trousers',
          brand: 'Flicks Tailoring',
          category: 'bottoms',
          subcategory: 'trousers',
          imagePath: 'catalog/olive-trousers.jpg',
          sourceUrl: 'https://flicks.example/products/olive-trousers',
          labels: { seasons: ['Warm Autumn'] },
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    expect(createdJson.ok).toBe(true);
    const createdId = createdJson.product.id as string;

    const patchRes = await patchProduct(
      new Request(`http://localhost/api/admin/products/${createdId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Olive Wide-Leg Pleated Trousers',
          labels: { seasons: ['Warm Autumn', 'Deep Autumn'] },
        }),
      }),
      { params: { id: createdId } },
    );
    expect(patchRes.status).toBe(200);
    const patchedJson = await patchRes.json();
    expect(patchedJson.product.name).toBe('Olive Wide-Leg Pleated Trousers');

    const deleteRes = await deleteProduct(
      new Request(`http://localhost/api/admin/products/${createdId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer admin-1' },
      }),
      { params: { id: createdId } },
    );
    expect(deleteRes.status).toBe(200);
    const deletedJson = await deleteRes.json();
    expect(deletedJson.product.isActive).toBe(false);

    const listRes = await getProducts(
      new Request('http://localhost/api/admin/products', {
        headers: { authorization: 'Bearer admin-1' },
      }),
    );
    const listJson = await listRes.json();
    expect(
      listJson.products.find((p: { id: string }) => p.id === createdId)
        ?.isActive,
    ).toBe(false);

    const state = getLocalDevMemoryState();
    state.analysisJobsById.set('analysis-vto-1', {
      id: 'analysis-vto-1',
      tokenId: 'tok-vto-1',
      status: 'completed',
      input: {
        requestHash: 'req-vto-1',
        facePhotoPath: 'photos/face.jpg',
        bodyPhotoPath: 'photos/body.jpg',
      },
      result: null,
      provider: 'gemini',
      providerReference: null,
      error: null,
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
      createdAt: '2026-11-04T12:00:00.000Z',
      updatedAt: '2026-11-04T12:00:01.000Z',
    });

    const vtoService = createSupabaseVirtualTryOnService();
    const vtoAttempt = await vtoService.createOrRetryJob({
      tokenId: 'tok-vto-1',
      analysisId: 'analysis-vto-1',
      productId: createdId,
      photoPath: 'photos/body.jpg',
    });
    expect(vtoAttempt).toEqual({
      ok: false,
      code: 'INVALID_PRODUCT',
    });

    const hardDeleteRes = await deleteProduct(
      new Request(`http://localhost/api/admin/products/${createdId}?permanent=true`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
      { params: { id: createdId } },
    );
    expect(hardDeleteRes.status).toBe(200);

    const listAfterHardDelete = await (
      await getProducts(
        new Request('http://localhost/api/admin/products', {
          headers: authHeaders,
        }),
      )
    ).json();
    expect(
      listAfterHardDelete.products.find((p: { id: string }) => p.id === createdId),
    ).toBeUndefined();
  });
});
