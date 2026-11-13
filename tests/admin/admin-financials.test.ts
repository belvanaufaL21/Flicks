import { describe, expect, it } from 'vitest';
import {
  createAdminService,
  type AdminRepository,
  type AdminSummaryMetrics,
} from '../../src/server/admin/admin.service';

function createMockRepository(
  metrics: Partial<AdminSummaryMetrics>,
): AdminRepository {
  return {
    findProfileByUserId: async () => null,
    listTransactions: async () => [],
    listJobs: async () => [],
    listProducts: async () => [],
    createProduct: async (p) => p,
    updateProduct: async () => null,
    getSummaryMetrics: async () => ({
      totalRevenueIdr: metrics.totalRevenueIdr ?? 0,
      paidTransactionsCount: metrics.paidTransactionsCount ?? 0,
      totalTokensCount: metrics.totalTokensCount ?? 0,
      geminiEstimatedCostIdr: metrics.geminiEstimatedCostIdr ?? 0,
      fashnActualCostIdr: metrics.fashnActualCostIdr ?? 0,
      usageEvents: metrics.usageEvents ?? [],
    }),
  };
}

describe('Admin Service Financial Calculations', () => {
  it('computes financial metrics deterministically when transactions and costs exist', async () => {
    const repo = createMockRepository({
      totalRevenueIdr: 38000,
      paidTransactionsCount: 2,
      geminiEstimatedCostIdr: 1000,
      fashnActualCostIdr: 2700,
    });

    const service = createAdminService(repo, { allowLocalDevFallback: true });
    const summary = await service.getSummary();

    expect(summary.financials).toBeDefined();
    expect(summary.financials.grossRevenueIdr).toBe(38000);
    expect(summary.financials.midtransFeeIdr).toBe(266);
    expect(summary.financials.geminiCostIdr).toBe(1000);
    expect(summary.financials.fashnCostIdr).toBe(2700);
    expect(summary.financials.totalCogsIdr).toBe(3966);
    expect(summary.financials.grossProfitIdr).toBe(34034);
    expect(summary.financials.grossMarginPercent).toBe(90);
  });

  it('safely handles zero revenue without dividing by zero', async () => {
    const repo = createMockRepository({
      totalRevenueIdr: 0,
      paidTransactionsCount: 0,
      geminiEstimatedCostIdr: 0,
      fashnActualCostIdr: 0,
    });

    const service = createAdminService(repo, { allowLocalDevFallback: true });
    const summary = await service.getSummary();

    expect(summary.financials).toBeDefined();
    expect(summary.financials.grossRevenueIdr).toBe(0);
    expect(summary.financials.midtransFeeIdr).toBe(0);
    expect(summary.financials.totalCogsIdr).toBe(0);
    expect(summary.financials.grossProfitIdr).toBe(0);
    expect(summary.financials.grossMarginPercent).toBe(0);
  });
});
