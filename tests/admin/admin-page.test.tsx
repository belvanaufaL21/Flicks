// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardView } from '../../src/app/admin/admin-dashboard-view';
import { AdminLoginView } from '../../src/app/admin/login/admin-login-view';
import type {
  AdminDashboardSummary,
  AdminJobItem,
  AdminTokenItem,
  AdminTransactionItem,
  CatalogProductRecord,
} from '../../src/server/admin/admin.service';

const sampleSummary: AdminDashboardSummary = {
  transactions: {
    totalCount: 4,
    paidCount: 3,
    totalRevenueIdr: 44997,
  },
  tokens: {
    totalCount: 3,
    availableCount: 1,
    reservedCount: 0,
    consumedCount: 2,
    expiredCount: 0,
  },
  jobs: {
    totalCount: 4,
    completedCount: 3,
    failedCount: 1,
    successRatePercent: 75,
  },
  costs: {
    geminiEstimatedIdr: 820,
    fashnActualIdr: 2400,
    totalCostIdr: 3220,
    events: [
      {
        id: 'ue-1',
        jobId: 'job-1',
        provider: 'gemini',
        feature: 'personal_color',
        model: 'gemini-2.5-flash',
        costType: 'estimated',
        amountIdr: 820,
        inputTokens: 1400,
        outputTokens: 390,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T12:00:00.000Z',
      },
      {
        id: 'ue-2',
        jobId: 'job-2',
        provider: 'fashn',
        feature: 'virtual_try_on',
        model: 'tryon-v1.6',
        costType: 'actual',
        amountIdr: 2400,
        inputTokens: null,
        outputTokens: null,
        status: 'completed',
        errorCode: null,
        createdAt: '2026-11-04T12:05:00.000Z',
      },
    ],
  },
  financials: {
    grossRevenueIdr: 44997,
    midtransFeeIdr: 315,
    geminiCostIdr: 820,
    fashnCostIdr: 2400,
    totalCogsIdr: 3535,
    grossProfitIdr: 41462,
    grossMarginPercent: 92,
  },
};

const sampleTransactions: AdminTransactionItem[] = [
  {
    paymentId: 'pay-900',
    providerReference: 'flicks-pay-900',
    amount: 14999,
    currency: 'IDR',
    status: 'paid',
    paidAt: '2026-11-04T12:00:00.000Z',
    createdAt: '2026-11-04T11:58:00.000Z',
    token: {
      id: 'tok-900',
      status: 'consumed',
      reservedAt: '2026-11-04T12:01:00.000Z',
      consumedAt: '2026-11-04T12:02:00.000Z',
    },
  },
];

const sampleTokens: AdminTokenItem[] = [
  {
    id: 'tok-900',
    status: 'consumed',
    paymentId: 'pay-900',
    reservedAt: '2026-11-04T12:01:00.000Z',
    consumedAt: '2026-11-04T12:02:00.000Z',
    createdAt: '2026-11-04T12:00:00.000Z',
  },
];

const sampleJobs: AdminJobItem[] = [
  {
    id: 'job-ai-900',
    tokenId: 'tok-900',
    type: 'analysis',
    status: 'completed',
    provider: 'gemini',
    providerReference: 'gemini-ref-900',
    attemptCount: 1,
    tokenRecoveryStatus: 'consumed',
    durationMs: 3900,
    error: null,
    createdAt: '2026-11-04T12:01:00.000Z',
    updatedAt: '2026-11-04T12:01:03.900Z',
  },
  {
    id: 'job-vto-901',
    tokenId: 'tok-901',
    type: 'virtual_try_on',
    status: 'failed',
    provider: 'fashn',
    providerReference: 'fashn-pred-901',
    attemptCount: 2,
    tokenRecoveryStatus: 'released',
    durationMs: 7400,
    error: 'FASHN timeout error',
    createdAt: '2026-11-04T12:04:00.000Z',
    updatedAt: '2026-11-04T12:04:07.400Z',
  },
];

const sampleProducts: CatalogProductRecord[] = [
  {
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
  },
];

describe('Admin UI (/admin & /admin/login)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders admin login form and invokes credential / local dev login callbacks', () => {
    const onSubmitCredentials = vi.fn();
    const onLocalDevLogin = vi.fn();

    render(
      <AdminLoginView
        allowLocalDevFallback={true}
        onSubmitCredentials={onSubmitCredentials}
        onLocalDevLogin={onLocalDevLogin}
      />,
    );

    expect(screen.getByText(/Administrator Sign In/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'admin@flicks.id' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'secret-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(onSubmitCredentials).toHaveBeenCalledWith({
      email: 'admin@flicks.id',
      password: 'secret-password',
    });

    const devButton = screen.getByRole('button', {
      name: /Continue with Local Dev Admin/i,
    });
    fireEvent.click(devButton);
    expect(onLocalDevLogin).toHaveBeenCalledOnce();
  });

  it('renders tabbed admin dashboard with summary metrics, transactions, jobs, products, and estimate-vs-actual costs', () => {
    const onDeactivateProduct = vi.fn();

    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={sampleTransactions}
        tokens={sampleTokens}
        jobs={sampleJobs}
        products={sampleProducts}
        onDeactivateProduct={onDeactivateProduct}
      />,
    );

    expect(screen.getByText(/Rp 44\.997|44,997/i)).toBeTruthy();
    expect(screen.getByText(/75%/i)).toBeTruthy();
    expect(screen.getByText(/Estimated \(Gemini\)/i)).toBeTruthy();
    expect(screen.getByText(/Actual \(FASHN\)/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('tab', { name: /Transactions & Tokens/i }),
    );
    expect(screen.getByText(/flicks-pay-900/i)).toBeTruthy();
    expect(screen.getAllByText(/consumed/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /AI & VTO Jobs/i }));
    expect(screen.getByText(/gemini-ref-900/i)).toBeTruthy();
    expect(screen.getByText(/FASHN timeout error/i)).toBeTruthy();
    expect(screen.getByText(/released/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));
    expect(screen.getByText(/Terracotta Linen Overshirt/i)).toBeTruthy();

    const deactivateBtn = screen.getByRole('button', {
      name: /Deactivate/i,
    });
    fireEvent.click(deactivateBtn);
    expect(onDeactivateProduct).toHaveBeenCalledWith('prod-active-1');

    fireEvent.click(screen.getByRole('tab', { name: /Usage & Costs/i }));
    expect(screen.getByText(/gemini-2.5-flash/i)).toBeTruthy();
    expect(screen.getByText(/tryon-v1.6/i)).toBeTruthy();
  });

  it('allows selecting gender, toggling dynamic body shape chips, color tones, sizes, uploading photo, and submitting product', async () => {
    const onCreateProduct = vi.fn();
    const onUploadPhoto = vi.fn().mockResolvedValue({
      imagePath: '/uploads/products/oxford-shirt.png',
      previewUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });

    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={sampleTransactions}
        tokens={sampleTokens}
        jobs={sampleJobs}
        products={sampleProducts}
        onCreateProduct={onCreateProduct}
        onUploadPhoto={onUploadPhoto}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Subcategory and Image Storage Path inputs should not exist
    expect(screen.queryByLabelText(/Subcategory/i)).toBeNull();
    expect(screen.queryByLabelText(/Image Storage Path/i)).toBeNull();

    // Category should be a select dropdown with multiple category options
    const categorySelect = screen.getByLabelText(/Category|Kategori/i) as HTMLSelectElement;
    expect(categorySelect.tagName).toBe('SELECT');
    expect(categorySelect.options.length).toBeGreaterThan(3);
    fireEvent.change(categorySelect, { target: { value: 'outerwear' } });

    // Gender selection
    const priaRadio = screen.getByLabelText(/Pria/i);
    const wanitaRadio = screen.getByLabelText(/Wanita/i);
    expect(priaRadio).toBeTruthy();
    expect(wanitaRadio).toBeTruthy();

    // Select Wanita -> female body shapes visible, male-only hidden
    fireEvent.click(wanitaRadio);
    expect(screen.getByText(/Hourglass \(Jam Pasir\)/i)).toBeTruthy();
    expect(screen.queryByText(/Trapezoid \(Trapesium\)/i)).toBeNull();

    // Select Pria -> male body shapes visible, female-only hidden
    fireEvent.click(priaRadio);
    expect(screen.getByText(/Trapezoid \(Trapesium\)/i)).toBeTruthy();
    expect(screen.queryByText(/Hourglass \(Jam Pasir\)/i)).toBeNull();

    // Toggle chips
    fireEvent.click(screen.getByText(/Trapezoid \(Trapesium\)/i));
    fireEvent.click(screen.getByText(/Autumn/i));
    fireEvent.click(screen.getByRole('button', { name: /^L$/i }));

    // Upload photo
    const fileInput = screen.getByLabelText(/Upload Foto Produk/i);
    const sampleFile = new File([new Uint8Array([137, 80, 78, 71])], 'oxford.png', {
      type: 'image/png',
    });
    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    expect(onUploadPhoto).toHaveBeenCalledWith(sampleFile);

    // Fill text fields
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: 'Classic Oxford Shirt' },
    });
    fireEvent.change(screen.getByLabelText(/Link Produk|Store URL/i), {
      target: { value: 'https://shopee.co.id/flicks/oxford' },
    });

    const submitButton = await screen.findByRole('button', {
      name: /Save to Catalog|Tambah ke Katalog/i,
    });
    fireEvent.click(submitButton);

    expect(onCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Classic Oxford Shirt',
        category: 'outerwear',
        imagePath: '/uploads/products/oxford-shirt.png',
        sourceUrl: 'https://shopee.co.id/flicks/oxford',
        labels: expect.objectContaining({
          gender: 'male',
          body_shapes: expect.arrayContaining(['trapezoid']),
          color_tones: expect.arrayContaining(['autumn']),
          sizes: expect.arrayContaining(['L']),
        }),
      }),
    );
  });

  it('renders catalog table with thumbnail image, gender badge, matching tags chips, sizes, and external store link', () => {
    const richProducts: CatalogProductRecord[] = [
      {
        id: 'prod-rich-1',
        name: 'Emerald Satin Wrap Dress',
        brand: 'FLICKS Studio',
        category: 'one-pieces',
        subcategory: 'wrap_dress',
        imagePath: '/uploads/products/emerald-wrap.jpg',
        sourceUrl: 'https://tokopedia.com/flicks/emerald-wrap',
        labels: {
          gender: 'female',
          body_shapes: ['hourglass', 'pear'],
          color_tones: ['autumn', 'winter'],
          sizes: ['S', 'M'],
        },
        isActive: true,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      },
    ];

    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={sampleTransactions}
        tokens={sampleTokens}
        jobs={sampleJobs}
        products={richProducts}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Thumbnail image
    const thumb = screen.getByRole('img', { name: /Emerald Satin Wrap Dress/i });
    expect(thumb.getAttribute('src')).toBe('/uploads/products/emerald-wrap.jpg');

    // Gender badge & matching tags & sizes in table
    expect(screen.getByText(/S, M/i)).toBeTruthy();

    // External store link
    const storeLink = screen.getByRole('link', {
      name: /Lihat Produk|Kunjungi Toko/i,
    });
    expect(storeLink.getAttribute('href')).toBe(
      'https://tokopedia.com/flicks/emerald-wrap',
    );
    expect(storeLink.getAttribute('target')).toBe('_blank');
  });

  it('opens an edit popup modal when Edit is clicked, submits updated fields, and allows deleting a product', async () => {
    const onUpdateProduct = vi.fn();
    const onDeleteProduct = vi.fn();

    const editableProducts: CatalogProductRecord[] = [
      {
        id: 'prod-edit-1',
        name: 'Emerald Satin Wrap Dress',
        brand: 'FLICKS Studio',
        category: 'dress',
        subcategory: null,
        imagePath: '/uploads/products/emerald-wrap.jpg',
        sourceUrl: 'https://tokopedia.com/flicks/emerald-wrap',
        labels: {
          gender: 'female',
          body_shapes: ['hourglass'],
          color_tones: ['autumn'],
          sizes: ['S', 'M'],
        },
        isActive: true,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      },
    ];

    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={sampleTransactions}
        tokens={sampleTokens}
        jobs={sampleJobs}
        products={editableProducts}
        onUpdateProduct={onUpdateProduct}
        onDeleteProduct={onDeleteProduct}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Click Edit icon button on product row (uses aria-label and contains an SVG icon)
    const editBtn = screen.getByRole('button', { name: /^Edit$/i });
    expect(editBtn.querySelector('svg')).toBeTruthy();
    expect(editBtn.textContent?.trim()).toBe('');
    fireEvent.click(editBtn);

    // Popup dialog should appear pre-filled with product values
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    const nameInput = screen.getByLabelText(/Edit Product Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Emerald Satin Wrap Dress');
    fireEvent.change(nameInput, {
      target: { value: 'Ruby Satin Wrap Dress' },
    });

    const categorySelect = screen.getByLabelText(/Edit Category/i) as HTMLSelectElement;
    expect(categorySelect.value).toBe('dress');
    fireEvent.change(categorySelect, { target: { value: 'one-pieces' } });

    const saveBtn = screen.getByRole('button', {
      name: /Simpan Perubahan|Save Changes/i,
    });
    fireEvent.click(saveBtn);

    expect(onUpdateProduct).toHaveBeenCalledWith(
      'prod-edit-1',
      expect.objectContaining({
        name: 'Ruby Satin Wrap Dress',
        category: 'one-pieces',
        labels: expect.objectContaining({
          gender: 'female',
          body_shapes: ['hourglass'],
          color_tones: ['autumn'],
          sizes: ['S', 'M'],
        }),
      }),
    );

    // Click Delete / Hapus icon button on product row (uses aria-label and contains an SVG icon)
    const deleteBtn = screen.getByRole('button', { name: /Hapus|Delete/i });
    expect(deleteBtn.querySelector('svg')).toBeTruthy();
    expect(deleteBtn.textContent?.trim()).toBe('');
    fireEvent.click(deleteBtn);
    expect(onDeleteProduct).toHaveBeenCalledWith('prod-edit-1');
  });
});
