// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('renders split-brand admin login form with accessible autocomplete and invokes callbacks', () => {
    const onSubmitCredentials = vi.fn();
    const onLocalDevLogin = vi.fn();

    render(
      <AdminLoginView
        allowLocalDevFallback={true}
        errorMessage="Invalid administrator credentials."
        onSubmitCredentials={onSubmitCredentials}
        onLocalDevLogin={onLocalDevLogin}
      />,
    );

    expect(screen.getByText(/Administrator Sign In/i)).toBeTruthy();
    expect(screen.getByText(/Admin Workspace/i)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Invalid administrator credentials.',
    );

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    expect(emailInput.getAttribute('autocomplete')).toBe('email');
    expect(passwordInput.getAttribute('autocomplete')).toBe('current-password');

    fireEvent.change(emailInput, { target: { value: 'admin@flicks.id' } });
    fireEvent.change(passwordInput, { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(onSubmitCredentials).toHaveBeenCalledWith({
      email: 'admin@flicks.id',
      password: 'secret-password',
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with Local Dev Admin/i }),
    );
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

    expect(screen.getAllByText(/Rp 44\.997|44,997/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/75%/i)).toBeTruthy();
    expect(screen.getByText(/Estimated \(Gemini/i)).toBeTruthy();
    expect(screen.getByText(/Actual \(FASHN/i)).toBeTruthy();

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

    expect(screen.queryByRole('button', { name: /^Deactivate$/i })).toBeNull();

    const statusBtn = screen.getByRole('button', {
      name: /Ubah status Terracotta Linen Overshirt/i,
    });
    expect(statusBtn.textContent).toContain('Active');
    fireEvent.click(statusBtn);
    expect(onDeactivateProduct).toHaveBeenCalledWith('prod-active-1');

    fireEvent.click(screen.getByRole('tab', { name: /Financials & Costs/i }));
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

    // Click "+ Tambah Produk Baru" to open Slide-Over Drawer
    fireEvent.click(
      screen.getByRole('button', { name: /\+ Tambah Produk Baru/i }),
    );

    const drawer = screen.getByRole('dialog', { name: /Tambah Produk Baru/i });
    expect(drawer).toBeTruthy();

    // Subcategory and Image Storage Path inputs should not exist
    expect(screen.queryByLabelText(/Subcategory/i)).toBeNull();
    expect(screen.queryByLabelText(/Image Storage Path/i)).toBeNull();

    // Category should be a select dropdown with multiple category options
    const categorySelect = within(drawer).getByLabelText(/Category|Kategori/i) as HTMLSelectElement;
    expect(categorySelect.tagName).toBe('SELECT');
    expect(categorySelect.options.length).toBeGreaterThan(3);
    fireEvent.change(categorySelect, { target: { value: 'outerwear' } });

    // Gender selection
    const priaRadio = within(drawer).getByLabelText(/Pria/i);
    const wanitaRadio = within(drawer).getByLabelText(/Wanita/i);
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

    // Toggle chips inside drawer
    fireEvent.click(screen.getByText(/Trapezoid \(Trapesium\)/i));
    fireEvent.click(within(drawer).getByRole('button', { name: /^Autumn$/i }));
    fireEvent.click(within(drawer).getByRole('button', { name: /^L$/i }));

    // Upload photo (opens 3:4 cropper modal)
    const fileInput = within(drawer).getByLabelText(/Upload Foto Produk/i);
    const sampleFile = new File([new Uint8Array([137, 80, 78, 71])], 'oxford.png', {
      type: 'image/png',
    });
    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    // Confirm crop in 3:4 modal
    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Potong & Gunakan Foto/i }));

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
    await act(async () => {
      fireEvent.click(submitButton);
    });

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
    await act(async () => {
      fireEvent.click(saveBtn);
    });

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

    // Confirmation dialog should appear
    expect(screen.getByText('Hapus Produk dari Katalog?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ya, Hapus Permanen/i }));
    expect(onDeleteProduct).toHaveBeenCalledWith('prod-edit-1');
  });

  it('displays preview image in edit modal, handles photo replacement, and falls back to placeholder on image error', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValue({
      imagePath: '/uploads/products/updated-gown.jpg',
      previewUrl: 'https://supabase.co/storage/v1/object/public/product-images/updated-gown.jpg',
    });

    const editableProducts: CatalogProductRecord[] = [
      {
        id: 'prod-preview-1',
        name: 'Burgundy Ruched Gown',
        brand: 'FLICKS Studio',
        category: 'dress',
        subcategory: null,
        imagePath: '/uploads/products/burgundy-gown.jpg',
        sourceUrl: null,
        labels: {
          gender: 'female',
          preview_url: '/uploads/products/burgundy-gown.jpg',
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
        onUploadPhoto={onUploadPhoto}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    const editBtn = screen.getByRole('button', { name: /^Edit$/i });
    fireEvent.click(editBtn);

    // Verify preview image is rendered in modal
    const previewImg = screen.getByAltText(/Preview Edit Produk/i) as HTMLImageElement;
    expect(previewImg).toBeTruthy();
    expect(previewImg.src).toContain('/uploads/products/burgundy-gown.jpg');

    // Trigger onError fallback
    fireEvent.error(previewImg);
    expect(previewImg.src).toContain('/uploads/products/placeholder.jpg');

    // Replace photo via file input (opens 3:4 cropper modal)
    const fileInput = screen.getByLabelText(/Ganti Foto Produk/i);
    const replacementFile = new File([new Uint8Array([255, 216, 255])], 'new-gown.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(fileInput, { target: { files: [replacementFile] } });

    // Confirm crop in 3:4 modal
    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Potong & Gunakan Foto/i }));

    expect(onUploadPhoto).toHaveBeenCalledWith(replacementFile);
    await vi.waitFor(() => {
      expect(previewImg.src).toBe(
        'https://supabase.co/storage/v1/object/public/product-images/updated-gown.jpg',
      );
    });
  });

  it('supports canceling interactive cropper modal without uploading', async () => {
    const onUploadPhoto = vi.fn();
    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[]}
        onUploadPhoto={onUploadPhoto}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Open create drawer first
    fireEvent.click(
      screen.getByRole('button', { name: /\+ Tambah Produk Baru/i }),
    );

    const fileInput = screen.getByLabelText(/Upload Foto Produk/i);
    const testFile = new File(['test-img'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const cropperModal = screen.getByRole('dialog', {
      name: /Sesuaikan Foto Produk/i,
    });
    expect(cropperModal).toBeTruthy();
    expect(within(cropperModal).getByLabelText(/Zoom/i)).toBeTruthy();

    // Cancel modal
    fireEvent.click(within(cropperModal).getByRole('button', { name: /Batal/i }));

    expect(screen.queryByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeNull();
    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('supports cropping existing catalog product photo from edit modal', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValue({
      imagePath: 'https://supabase.co/storage/v1/object/public/product-images/recropped.jpg',
      previewUrl: 'https://supabase.co/storage/v1/object/public/product-images/recropped.jpg',
    });
    const onUpdateProduct = vi.fn().mockResolvedValue(undefined);
    const existingProduct: CatalogProductRecord = {
      id: 'prod-crop-1',
      name: 'Burgundy Ruched Gown',
      brand: 'FLICKS Studio',
      category: 'dress',
      subcategory: null,
      imagePath: '/uploads/products/burgundy-gown.jpg',
      sourceUrl: null,
      labels: {
        gender: 'female',
        preview_url: '/uploads/products/burgundy-gown.jpg',
      },
      isActive: true,
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[existingProduct]}
        onUploadPhoto={onUploadPhoto}
        onUpdateProduct={onUpdateProduct}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Open Edit modal
    fireEvent.click(screen.getByTitle('Edit Produk'));
    expect(screen.getByRole('heading', { name: /Edit Produk/i })).toBeTruthy();

    // Click "Sesuaikan / Crop Foto Saat Ini (3:4)"
    const cropExistingBtn = screen.getByRole('button', {
      name: /Sesuaikan \/ Crop Foto Saat Ini \(3:4\)/i,
    });
    expect(cropExistingBtn).toBeTruthy();
    fireEvent.click(cropExistingBtn);

    // Cropper modal opens
    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();

    // Apply crop
    fireEvent.click(
      screen.getByRole('button', { name: /Potong & Gunakan Foto/i }),
    );

    await vi.waitFor(() => {
      expect(onUploadPhoto).toHaveBeenCalledTimes(1);
      const previewImg = screen.getByAltText(/Preview Edit Produk/i) as HTMLImageElement;
      expect(previewImg.src).toBe(
        'https://supabase.co/storage/v1/object/public/product-images/recropped.jpg',
      );
    });

    // Save changes
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Simpan Perubahan/i }),
      );
    });

    expect(onUpdateProduct).toHaveBeenCalledWith(
      existingProduct.id,
      expect.objectContaining({
        imagePath:
          'https://supabase.co/storage/v1/object/public/product-images/recropped.jpg',
      }),
    );
  });

  it('toggles product status directly by clicking the status badge and removes redundant row crop button', async () => {
    const onDeactivateProduct = vi.fn().mockResolvedValue(undefined);
    const onUpdateProduct = vi.fn().mockResolvedValue(undefined);
    const existingProduct: CatalogProductRecord = {
      id: 'prod-crop-2',
      name: 'Classic Linen Blazer',
      brand: 'FLICKS Studio',
      category: 'outerwear',
      subcategory: null,
      imagePath: '/uploads/products/linen-blazer.jpg',
      sourceUrl: null,
      labels: {
        gender: 'unisex',
        preview_url: '/uploads/products/linen-blazer.jpg',
      },
      isActive: true,
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    const { rerender } = render(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[existingProduct]}
        onDeactivateProduct={onDeactivateProduct}
        onUpdateProduct={onUpdateProduct}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Product Catalog/i }));

    // Verify row crop icon button was removed
    expect(screen.queryByTitle('Sesuaikan / Crop Foto (3:4)')).toBeNull();

    // Toggle active -> inactive
    const activeStatusBtn = screen.getByRole('button', {
      name: /Ubah status Classic Linen Blazer/i,
    });
    expect(activeStatusBtn.textContent).toContain('Active');
    await act(async () => {
      fireEvent.click(activeStatusBtn);
    });

    expect(onDeactivateProduct).toHaveBeenCalledWith(existingProduct.id);

    // Rerender as inactive
    rerender(
      <AdminDashboardView
        summary={sampleSummary}
        transactions={[]}
        tokens={[]}
        jobs={[]}
        products={[{ ...existingProduct, isActive: false }]}
        onDeactivateProduct={onDeactivateProduct}
        onUpdateProduct={onUpdateProduct}
      />,
    );

    // Toggle inactive -> active
    const inactiveStatusBtn = screen.getByRole('button', {
      name: /Ubah status Classic Linen Blazer/i,
    });
    expect(inactiveStatusBtn.textContent).toContain('Inactive');
    await act(async () => {
      fireEvent.click(inactiveStatusBtn);
    });

    expect(onUpdateProduct).toHaveBeenCalledWith(existingProduct.id, {
      isActive: true,
    });
  });
});
