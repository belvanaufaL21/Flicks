import { describe, expect, it, vi } from 'vitest';
import {
  createAdminService,
  createInMemoryAdminDataRepository,
  normalizeProductLabels,
  type AdminJobItem,
  type AdminProfileRecord,
  type AdminRepository,
  type AdminSummaryMetrics,
  type AdminTokenItem,
  type AdminTransactionItem,
} from '../../src/server/admin/admin.service';
import type { CatalogProductRecord } from '../../src/server/dev/local-memory-store';

function createFakeAdminRepository(): {
  repo: AdminRepository;
  profiles: Map<string, AdminProfileRecord>;
  tokensByBearer: Map<string, string>;
  products: Map<string, CatalogProductRecord>;
  transactions: AdminTransactionItem[];
  tokens: AdminTokenItem[];
  jobs: AdminJobItem[];
  metrics: AdminSummaryMetrics;
} {
  const profiles = new Map<string, AdminProfileRecord>([
    [
      'admin-user-1',
      {
        userId: 'admin-user-1',
        role: 'admin',
        createdAt: '2026-11-04T00:00:00.000Z',
      },
    ],
    [
      'superadmin-user-1',
      {
        userId: 'superadmin-user-1',
        role: 'superadmin',
        createdAt: '2026-11-04T00:00:00.000Z',
      },
    ],
  ]);

  const tokensByBearer = new Map<string, string>([
    ['valid-admin-jwt', 'admin-user-1'],
    ['valid-visitor-jwt', 'visitor-user-99'],
  ]);

  const products = new Map<string, CatalogProductRecord>([
    [
      'prod-1',
      {
        id: 'prod-1',
        name: 'Terracotta Linen Overshirt',
        brand: 'Flicks Essentials',
        category: 'tops',
        subcategory: 'overshirt',
        imagePath: 'catalog/terracotta-overshirt.jpg',
        sourceUrl: 'https://flicks.example/products/terracotta-overshirt',
        labels: { seasons: ['Warm Autumn'], silhouettes: ['Inverted Triangle'] },
        isActive: true,
        createdAt: '2026-11-04T00:00:00.000Z',
        updatedAt: '2026-11-04T00:00:00.000Z',
      },
    ],
  ]);

  const transactions: AdminTransactionItem[] = [
    {
      paymentId: 'pay-1',
      providerReference: 'flicks-pay-1',
      amount: 14999,
      currency: 'IDR',
      status: 'paid',
      paidAt: '2026-11-04T10:00:00.000Z',
      createdAt: '2026-11-04T09:59:00.000Z',
      token: {
        id: 'tok-1',
        status: 'consumed',
        reservedAt: '2026-11-04T10:01:00.000Z',
        consumedAt: '2026-11-04T10:02:00.000Z',
      },
    },
  ];

  const tokens: AdminTokenItem[] = [
    {
      id: 'tok-1',
      status: 'consumed',
      paymentId: 'pay-1',
      reservedAt: '2026-11-04T10:01:00.000Z',
      consumedAt: '2026-11-04T10:02:00.000Z',
      createdAt: '2026-11-04T10:00:00.000Z',
    },
    {
      id: 'tok-2',
      status: 'available',
      paymentId: 'pay-2',
      reservedAt: null,
      consumedAt: null,
      createdAt: '2026-11-04T10:05:00.000Z',
    },
  ];

  const jobs: AdminJobItem[] = [
    {
      id: 'job-analysis-1',
      tokenId: 'tok-1',
      type: 'analysis',
      status: 'completed',
      provider: 'gemini',
      providerReference: 'gemini-req-1',
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
      durationMs: 4200,
      error: null,
      createdAt: '2026-11-04T10:01:00.000Z',
      updatedAt: '2026-11-04T10:01:04.200Z',
    },
    {
      id: 'job-vto-1',
      tokenId: 'tok-2',
      type: 'virtual_try_on',
      status: 'failed',
      provider: 'fashn',
      providerReference: 'fashn-pred-99',
      attemptCount: 2,
      tokenRecoveryStatus: 'released',
      durationMs: 8100,
      error: 'Provider timeout',
      createdAt: '2026-11-04T10:06:00.000Z',
      updatedAt: '2026-11-04T10:06:08.100Z',
    },
  ];

  const metrics: AdminSummaryMetrics = {
    totalRevenueIdr: 29998,
    paidTransactionsCount: 2,
    totalTransactionsCount: 3,
    totalTokensCount: 2,
    availableTokensCount: 1,
    reservedTokensCount: 0,
    consumedTokensCount: 1,
    expiredTokensCount: 0,
    totalJobsCount: 2,
    completedJobsCount: 1,
    failedJobsCount: 1,
    geminiEstimatedCostIdr: 450,
    fashnActualCostIdr: 1200,
    usageEvents: [
      {
        id: 'ue-1',
        jobId: 'job-analysis-1',
        provider: 'gemini',
        feature: 'personal_color',
        model: 'gemini-2.5-flash',
        costType: 'estimated',
        amountIdr: 450,
        inputTokens: 1200,
        outputTokens: 350,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T10:01:04.200Z',
      },
      {
        id: 'ue-2',
        jobId: 'job-vto-1',
        provider: 'fashn',
        feature: 'virtual_try_on',
        model: 'tryon-v1.6',
        costType: 'actual',
        amountIdr: 1200,
        inputTokens: null,
        outputTokens: null,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T10:06:08.100Z',
      },
    ],
  };

  const repo: AdminRepository = {
    async findProfileByUserId(userId) {
      return profiles.get(userId) ?? null;
    },
    async resolveUserIdFromToken(token) {
      return tokensByBearer.get(token) ?? null;
    },
    async listTransactions() {
      return transactions;
    },
    async listTokens() {
      return tokens;
    },
    async listJobs() {
      return jobs;
    },
    async listProducts() {
      return Array.from(products.values());
    },
    async createProduct(product) {
      products.set(product.id, product);
      return product;
    },
    async updateProduct(id, patch) {
      const existing = products.get(id);
      if (!existing) return null;
      const updated: CatalogProductRecord = { ...existing, ...patch };
      products.set(id, updated);
      return updated;
    },
    async getSummaryMetrics() {
      return metrics;
    },
  };

  return {
    repo,
    profiles,
    tokensByBearer,
    products,
    transactions,
    tokens,
    jobs,
    metrics,
  };
}

describe('AdminService', () => {
  it('rejects unauthenticated and non-admin users, allowing only admin/superadmin profiles', async () => {
    const { repo } = createFakeAdminRepository();
    const service = createAdminService(repo);

    await expect(service.assertAdminUser(null)).rejects.toThrow('UNAUTHENTICATED');
    await expect(service.assertAdminUser('visitor-99')).rejects.toThrow('FORBIDDEN');

    const admin = await service.assertAdminUser('admin-user-1');
    expect(admin.role).toBe('admin');

    const superadmin = await service.assertAdminUser('superadmin-user-1');
    expect(superadmin.role).toBe('superadmin');
  });

  it('verifies admin session from Authorization Bearer token and supports explicit dev fallback with warning', async () => {
    const { repo } = createFakeAdminRepository();
    const service = createAdminService(repo, { allowLocalDevFallback: false });

    await expect(
      service.assertAdminSession(new Request('http://localhost/api/admin/summary')),
    ).rejects.toThrow('UNAUTHENTICATED');

    await expect(
      service.assertAdminSession(
        new Request('http://localhost/api/admin/summary', {
          headers: { authorization: 'Bearer invalid-jwt' },
        }),
      ),
    ).rejects.toThrow('UNAUTHENTICATED');

    await expect(
      service.assertAdminSession(
        new Request('http://localhost/api/admin/summary', {
          headers: { authorization: 'Bearer valid-visitor-jwt' },
        }),
      ),
    ).rejects.toThrow('FORBIDDEN');

    const verified = await service.assertAdminSession(
      new Request('http://localhost/api/admin/summary', {
        headers: { authorization: 'Bearer valid-admin-jwt' },
      }),
    );
    expect(verified.userId).toBe('admin-user-1');
    expect(verified.role).toBe('admin');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const devService = createAdminService(repo, { allowLocalDevFallback: true });
    const devSession = await devService.assertAdminSession(
      new Request('http://localhost/api/admin/summary', {
        headers: { 'x-flicks-dev-admin': '1' },
      }),
    );
    expect(devSession.role).toBe('superadmin');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('lists transactions joined with token lifecycle status and lists job monitoring records', async () => {
    const { repo } = createFakeAdminRepository();
    const service = createAdminService(repo);

    const txList = await service.getTransactions();
    expect(txList).toHaveLength(1);
    expect(txList[0].paymentId).toBe('pay-1');
    expect(txList[0].token?.status).toBe('consumed');

    const tokenList = await service.getTokens();
    expect(tokenList).toHaveLength(2);
    expect(tokenList.map((t) => t.status)).toEqual(['consumed', 'available']);

    const jobList = await service.getJobs();
    expect(jobList).toHaveLength(2);
    expect(jobList[0]).toMatchObject({
      id: 'job-analysis-1',
      provider: 'gemini',
      providerReference: 'gemini-req-1',
      attemptCount: 1,
      tokenRecoveryStatus: 'consumed',
    });
    expect(jobList[1]).toMatchObject({
      id: 'job-vto-1',
      provider: 'fashn',
      status: 'failed',
      tokenRecoveryStatus: 'released',
      error: 'Provider timeout',
    });
  });

  it('creates, updates, and soft-deactivates catalog products without deleting historical rows', async () => {
    const { repo, products } = createFakeAdminRepository();
    const service = createAdminService(repo, {
      createId: () => 'prod-2',
      now: () => new Date('2026-11-04T15:00:00.000Z'),
    });

    const created = await service.createProduct({
      name: 'Cobalt Structured Blazer',
      brand: 'Flicks Studio',
      category: 'outerwear',
      subcategory: 'blazer',
      imagePath: 'catalog/cobalt-blazer.jpg',
      sourceUrl: 'https://flicks.example/products/cobalt-blazer',
      labels: { seasons: ['Cool Winter'], fit: 'structured' },
    });

    expect(created.id).toBe('prod-2');
    expect(created.isActive).toBe(true);
    expect(created.labels).toEqual({
      seasons: ['Cool Winter'],
      fit: 'structured',
    });

    const updated = await service.updateProduct('prod-2', {
      name: 'Cobalt Structured Wool Blazer',
      subcategory: 'tailored-blazer',
    });
    expect(updated.name).toBe('Cobalt Structured Wool Blazer');
    expect(updated.subcategory).toBe('tailored-blazer');

    const deactivated = await service.deactivateProduct('prod-2');
    expect(deactivated.isActive).toBe(false);
    expect(products.has('prod-2')).toBe(true);
  });

  it('returns summary metrics explicitly distinguishing Gemini estimated cost from FASHN actual cost', async () => {
    const { repo } = createFakeAdminRepository();
    const service = createAdminService(repo);

    const summary = await service.getSummary();
    expect(summary.transactions.totalRevenueIdr).toBe(29998);
    expect(summary.transactions.paidCount).toBe(2);
    expect(summary.tokens.totalCount).toBe(2);
    expect(summary.jobs.totalCount).toBe(2);
    expect(summary.jobs.completedCount).toBe(1);
    expect(summary.jobs.failedCount).toBe(1);
    expect(summary.jobs.successRatePercent).toBe(50);
    expect(summary.costs).toMatchObject({
      geminiEstimatedIdr: 450,
      fashnActualIdr: 1200,
      totalCostIdr: 1650,
    });
    expect(summary.costs.events).toHaveLength(2);
    expect(summary.costs.events[0].costType).toBe('estimated');
    expect(summary.costs.events[1].costType).toBe('actual');
  });

  it('creates, normalizes, and lists products with structured matching labels and sourceUrl', async () => {
    const repository = createInMemoryAdminDataRepository();
    const service = createAdminService(repository);

    expect(
      normalizeProductLabels({
        gender: 'male',
        body_shapes: ['trapezoid', 'rectangle', 'trapezoid'],
        color_tones: ['autumn', 'spring', 'autumn'],
      }),
    ).toEqual({
      gender: 'male',
      body_shapes: ['trapezoid', 'rectangle'],
      color_tones: ['autumn', 'spring'],
      sizes: [],
    });

    const product = await service.createProduct({
      name: 'Oversized Linen Shirt',
      brand: 'FLICKS Basics',
      category: 'top',
      subcategory: 'shirt',
      imagePath: '/uploads/products/test-shirt.jpg',
      sourceUrl: 'https://shopee.co.id/test-shirt',
      labels: {
        gender: 'male',
        body_shapes: ['trapezoid', 'rectangle'],
        color_tones: ['autumn', 'spring'],
        sizes: ['M', 'L', 'XL'],
      },
    });

    expect(product.name).toBe('Oversized Linen Shirt');
    expect(product.sourceUrl).toBe('https://shopee.co.id/test-shirt');
    expect(product.labels).toEqual({
      gender: 'male',
      body_shapes: ['trapezoid', 'rectangle'],
      color_tones: ['autumn', 'spring'],
      sizes: ['M', 'L', 'XL'],
    });

    const partialProduct = await service.createProduct({
      name: 'Minimalist Chino Pants',
      category: 'bottom',
      imagePath: '/uploads/products/test-chino.jpg',
      labels: {
        gender: 'female',
        body_shapes: ['hourglass', 'pear', 'hourglass'],
      },
    });

    expect(partialProduct.labels).toEqual({
      gender: 'female',
      body_shapes: ['hourglass', 'pear'],
      color_tones: [],
      sizes: [],
    });

    const list = await service.getProducts();
    const found = list.find((p) => p.id === product.id);
    expect(found?.labels.gender).toBe('male');
    expect(found?.labels.body_shapes).toEqual(['trapezoid', 'rectangle']);
    expect(found?.labels.color_tones).toEqual(['autumn', 'spring']);
    expect(found?.labels.sizes).toEqual(['M', 'L', 'XL']);
    expect(found?.sourceUrl).toBe('https://shopee.co.id/test-shirt');
  });
});
