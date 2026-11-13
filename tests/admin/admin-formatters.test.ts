import { describe, expect, it } from 'vitest';
import {
  buildFinancialLedgerEntries,
  computeFinancialKpis,
  filterTransactionsByPeriod,
  formatDateTime,
  formatIdr,
  generateFinancialsCsv,
  getBodyShapesForGender,
  isBottomsCategory,
  sanitizeCsvCell,
} from '../../src/app/admin/admin-formatters';
import type {
  AdminJobItem,
  AdminTransactionItem,
  AdminUsageCostItem,
} from '../../src/server/admin/admin.service';

describe('Admin Shared Formatters & Utilities', () => {
  describe('formatIdr', () => {
    it('formats numbers into Indonesian Rupiah currency strings', () => {
      expect(formatIdr(19000)).toMatch(/Rp\s*19\.000/);
      expect(formatIdr(0)).toMatch(/Rp\s*0/);
    });
  });

  describe('formatDateTime', () => {
    it('returns a dash for empty or null dates', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatDateTime('')).toBe('—');
    });

    it('formats valid ISO dates', () => {
      const formatted = formatDateTime('2026-11-06T10:30:00.000Z');
      expect(formatted).not.toBe('—');
      expect(formatted).toContain('2026');
    });
  });

  describe('sanitizeCsvCell', () => {
    it('escapes quotes and dangerous spreadsheet formula prefixes', () => {
      expect(sanitizeCsvCell('Normal text')).toBe('"Normal text"');
      expect(sanitizeCsvCell('With "quotes"')).toBe('"With ""quotes"""');
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
      expect(sanitizeCsvCell('+12345')).toBe('"\'+12345"');
      expect(sanitizeCsvCell('-500')).toBe('"\' -500"'.replace(/ /, ''));
    });
  });

  describe('isBottomsCategory', () => {
    it('identifies bottoms categories correctly', () => {
      expect(isBottomsCategory('bottoms')).toBe(true);
      expect(isBottomsCategory('skirt')).toBe(true);
      expect(isBottomsCategory('pants')).toBe(true);
      expect(isBottomsCategory('celana pendek')).toBe(true);
      expect(isBottomsCategory('tops')).toBe(false);
      expect(isBottomsCategory('outerwear')).toBe(false);
      expect(isBottomsCategory(null)).toBe(false);
    });
  });

  describe('getBodyShapesForGender', () => {
    it('returns gender-appropriate body shapes without unknown', () => {
      const male = getBodyShapesForGender('male');
      expect(male).toContain('trapezoid');
      expect(male).not.toContain('hourglass');
      expect(male).not.toContain('unknown');

      const female = getBodyShapesForGender('female');
      expect(female).toContain('hourglass');
      expect(female).not.toContain('trapezoid');
      expect(female).not.toContain('unknown');

      const unisex = getBodyShapesForGender('unisex');
      expect(unisex).toContain('trapezoid');
      expect(unisex).toContain('hourglass');
    });
  });

  describe('filterTransactionsByPeriod', () => {
    const mockTx: AdminTransactionItem[] = [
      {
        paymentId: '1',
        providerReference: 'ORDER-1',
        amount: 19000,
        currency: 'IDR',
        status: 'paid',
        paidAt: '2026-11-08T10:00:00.000Z',
        createdAt: '2026-11-08T09:00:00.000Z',
        token: null,
      },
      {
        paymentId: '2',
        providerReference: 'ORDER-2',
        amount: 19000,
        currency: 'IDR',
        status: 'paid',
        paidAt: '2026-11-01T10:00:00.000Z',
        createdAt: '2026-11-01T09:00:00.000Z',
        token: null,
      },
      {
        paymentId: '3',
        providerReference: 'ORDER-3',
        amount: 19000,
        currency: 'IDR',
        status: 'pending',
        paidAt: null,
        createdAt: '2026-11-08T10:00:00.000Z',
        token: null,
      },
    ];

    it('filters paid transactions by period', () => {
      const anchorDate = new Date('2026-11-08T12:00:00.000Z');
      const all = filterTransactionsByPeriod(mockTx, 'all', anchorDate);
      expect(all).toHaveLength(2); // ignores pending

      const today = filterTransactionsByPeriod(mockTx, 'today', anchorDate);
      expect(today).toHaveLength(1);
      expect(today[0].paymentId).toBe('1');
    });
  });

  describe('buildFinancialLedgerEntries & computeFinancialKpis', () => {
    it('joins transactions, jobs, and cost events to calculate accurate margins and COGS', () => {
      const transactions: AdminTransactionItem[] = [
        {
          paymentId: 'pay-1',
          providerReference: 'ORDER-1',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paidAt: '2026-11-08T10:00:00.000Z',
          createdAt: '2026-11-08T09:00:00.000Z',
          token: {
            id: 'tok-1',
            status: 'consumed',
            reservedAt: '2026-11-08T09:05:00.000Z',
            consumedAt: '2026-11-08T09:10:00.000Z',
          },
        },
      ];

      const jobs: AdminJobItem[] = [
        {
          id: 'job-1',
          userId: 'user-1',
          type: 'analysis',
          status: 'completed',
          tokenId: 'tok-1',
          attemptCount: 1,
          createdAt: '2026-11-08T09:05:00.000Z',
          startedAt: '2026-11-08T09:05:01.000Z',
          completedAt: '2026-11-08T09:05:05.000Z',
          errorCode: null,
          errorMessage: null,
        },
      ];

      const costEvents: AdminUsageCostItem[] = [
        {
          id: 'ev-1',
          jobId: 'job-1',
          provider: 'gemini',
          feature: 'personal_color',
          model: 'gemini-2.5-flash',
          costType: 'estimated',
          amountIdr: 500,
          inputTokens: 100,
          outputTokens: 50,
          status: 'completed',
          errorCode: null,
          createdAt: '2026-11-08T09:05:05.000Z',
        },
        {
          id: 'ev-2',
          jobId: 'job-1',
          provider: 'fashn',
          feature: 'virtual_try_on',
          model: 'tryon-v1.6',
          costType: 'actual',
          amountIdr: 1350,
          inputTokens: null,
          outputTokens: null,
          status: 'completed',
          errorCode: null,
          createdAt: '2026-11-08T09:05:06.000Z',
        },
      ];

      const entries = buildFinancialLedgerEntries(transactions, jobs, costEvents);
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.revenueIdr).toBe(19000);
      expect(entry.midtransFeeIdr).toBe(133); // 19000 * 0.007 = 133
      expect(entry.geminiCostIdr).toBe(500);
      expect(entry.fashnCostIdr).toBe(1350);
      expect(entry.totalCogsIdr).toBe(1983);
      expect(entry.grossProfitIdr).toBe(17017);
      expect(entry.grossMarginPercent).toBe(90);

      const kpis = computeFinancialKpis(entries);
      expect(kpis.paidCount).toBe(1);
      expect(kpis.grossRevenueIdr).toBe(19000);
      expect(kpis.totalCogsIdr).toBe(1983);
      expect(kpis.grossProfitIdr).toBe(17017);
      expect(kpis.grossMarginPercent).toBe(90);

      const csv = generateFinancialsCsv(entries);
      expect(csv).toContain('ORDER-1');
      expect(csv).toContain('19000');
      expect(csv).toContain('90%');
    });
  });
});
