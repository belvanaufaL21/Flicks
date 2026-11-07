'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDashboardView } from './admin-dashboard-view';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
  CatalogProductRecord,
  CreateProductInput,
  UpdateProductInput,
} from '@/server/admin/admin.service';

const EMPTY_SUMMARY: AdminDashboardSummary = {
  transactions: { totalCount: 0, paidCount: 0, totalRevenueIdr: 0 },
  tokens: {
    totalCount: 0,
    availableCount: 0,
    reservedCount: 0,
    consumedCount: 0,
    expiredCount: 0,
  },
  jobs: {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    successRatePercent: 0,
  },
  costs: {
    geminiEstimatedIdr: 0,
    fashnActualIdr: 0,
    totalCostIdr: 0,
    events: [],
  },
  financials: {
    grossRevenueIdr: 0,
    midtransFeeIdr: 0,
    geminiCostIdr: 0,
    fashnCostIdr: 0,
    totalCogsIdr: 0,
    grossProfitIdr: 0,
    grossMarginPercent: 0,
  },
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AdminDashboardSummary>(EMPTY_SUMMARY);
  const [transactions, setTransactions] = useState<AdminTransactionItem[]>([]);
  const [tokens, setTokens] = useState<AdminTokenItem[]>([]);
  const [jobs, setJobs] = useState<AdminJobItem[]>([]);
  const [products, setProducts] = useState<CatalogProductRecord[]>([]);

  const getAuthHeaders = useCallback((): HeadersInit => {
    // ponytail: fallback to localStorage for tab/reload persistence in local dev. Upgrade path: Supabase onAuthStateChange.
    const token =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem('flicks_admin_access_token') ||
          window.localStorage.getItem('flicks_admin_access_token')
        : null;
    return token ? { authorization: `Bearer ${token}` } : {};
  }, []);

  const loadDashboardData = useCallback(async () => {
    const headers = getAuthHeaders();
    const [summaryRes, txRes, jobsRes, prodRes] = await Promise.all([
      fetch('/api/admin/summary', { headers }),
      fetch('/api/admin/transactions', { headers }),
      fetch('/api/admin/jobs', { headers }),
      fetch('/api/admin/products', { headers }),
    ]);

    if (summaryRes.status === 401 || summaryRes.status === 403) {
      router.push('/admin/login');
      return;
    }

    if (summaryRes.ok) {
      const data = await summaryRes.json();
      if (data.summary) setSummary(data.summary);
    }
    if (txRes.ok) {
      const data = await txRes.json();
      if (data.transactions) setTransactions(data.transactions);
      if (data.tokens) setTokens(data.tokens);
    }
    if (jobsRes.ok) {
      const data = await jobsRes.json();
      if (data.jobs) setJobs(data.jobs);
    }
    if (prodRes.ok) {
      const data = await prodRes.json();
      if (data.products) setProducts(data.products);
    }
  }, [getAuthHeaders, router]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const handleCreateProduct = async (input: CreateProductInput) => {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      await loadDashboardData();
    }
  };

  const handleDeactivateProduct = async (productId: string) => {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      await loadDashboardData();
    }
  };

  const handleUpdateProduct = async (
    productId: string,
    patch: UpdateProductInput,
  ) => {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await loadDashboardData();
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const res = await fetch(`/api/admin/products/${productId}?permanent=true`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      await loadDashboardData();
    }
  };

  const handleUploadPhoto = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/admin/products/upload', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Gagal mengunggah foto produk.');
    }

    return {
      imagePath: data.imagePath as string,
      previewUrl: data.previewUrl as string,
    };
  };

  return (
    <AdminDashboardView
      summary={summary}
      transactions={transactions}
      tokens={tokens}
      jobs={jobs}
      products={products}
      onCreateProduct={handleCreateProduct}
      onUpdateProduct={handleUpdateProduct}
      onDeleteProduct={handleDeleteProduct}
      onDeactivateProduct={handleDeactivateProduct}
      onUploadPhoto={handleUploadPhoto}
    />
  );
}
