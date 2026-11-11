// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCatalogSection } from '../../src/app/admin/components/product-catalog-section';
import { ProductCatalogDrawer } from '../../src/app/admin/components/product-catalog-drawer';
import type { CatalogProductRecord } from '../../src/server/admin/admin.service';

const sampleProducts: CatalogProductRecord[] = [
  {
    id: 'prod-1',
    name: 'Terracotta Linen Overshirt',
    brand: 'Flicks Essentials',
    category: 'tops',
    subcategory: 'overshirt',
    imagePath: '/uploads/products/terracotta-overshirt.jpg',
    sourceUrl: 'https://shopee.co.id/flicks/terracotta',
    labels: {
      gender: 'male',
      body_shapes: ['trapezoid', 'rectangle'],
      color_tones: ['autumn'],
      sizes: ['M', 'L'],
    },
    isActive: true,
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
  },
  {
    id: 'prod-2',
    name: 'Emerald Satin Wrap Dress',
    brand: 'FLICKS Studio',
    category: 'dress',
    subcategory: null,
    imagePath: '/uploads/products/emerald-wrap.jpg',
    sourceUrl: 'https://tokopedia.com/flicks/emerald-wrap',
    labels: {
      gender: 'female',
      body_shapes: ['hourglass', 'pear'],
      color_tones: ['winter'],
      sizes: ['S', 'M'],
    },
    isActive: false,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
  },
  {
    id: 'prod-3',
    name: 'Relaxed Wide-Leg Trousers',
    brand: 'Minimalist Club',
    category: 'bottoms',
    subcategory: 'pants',
    imagePath: '/uploads/products/wide-leg.jpg',
    sourceUrl: null,
    labels: {
      gender: 'unisex',
      body_shapes: ['rectangle', 'hourglass'],
      color_tones: ['summer', 'spring'],
      sizes: ['M', 'L', 'XL'],
    },
    isActive: true,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  },
];

describe('ProductCatalogSection & ProductCatalogDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders catalog table with thumbnail images, badges, tags, sizes, and action buttons', () => {
    render(<ProductCatalogSection products={sampleProducts} />);

    expect(screen.getByText('Terracotta Linen Overshirt')).toBeTruthy();
    expect(screen.getByText('Emerald Satin Wrap Dress')).toBeTruthy();
    expect(screen.getByText('Relaxed Wide-Leg Trousers')).toBeTruthy();

    // Check brand rendering
    expect(screen.getByText('Flicks Essentials')).toBeTruthy();
    expect(screen.getByText('FLICKS Studio')).toBeTruthy();

    // Check store link
    const storeLinks = screen.getAllByRole('link', { name: /Lihat Produk/i });
    expect(storeLinks.length).toBe(2);
    expect(storeLinks[0]!.getAttribute('href')).toBe(
      'https://shopee.co.id/flicks/terracotta',
    );
    expect(storeLinks[0]!.getAttribute('target')).toBe('_blank');

    // Check status badges
    const statusBtns = screen.getAllByRole('button', {
      name: /Ubah status/i,
    });
    expect(statusBtns.length).toBe(3);
    expect(statusBtns[0]?.textContent).toContain('Active');
    expect(statusBtns[1]?.textContent).toContain('Inactive');

    // Check primary button
    expect(
      screen.getByRole('button', { name: /\+ Tambah Produk Baru/i }),
    ).toBeTruthy();
  });

  it('filters products by search query, category, gender, and status pills', () => {
    render(<ProductCatalogSection products={sampleProducts} />);

    const searchInput = screen.getByLabelText(/Cari produk/i);
    const categorySelect = screen.getByLabelText(/Filter kategori/i);
    const genderSelect = screen.getByLabelText(/Filter gender/i);

    // Search by text
    fireEvent.change(searchInput, { target: { value: 'Emerald' } });
    expect(screen.getByText('Emerald Satin Wrap Dress')).toBeTruthy();
    expect(screen.queryByText('Terracotta Linen Overshirt')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Terracotta Linen Overshirt')).toBeTruthy();

    // Filter by category
    fireEvent.change(categorySelect, { target: { value: 'bottoms' } });
    expect(screen.getByText('Relaxed Wide-Leg Trousers')).toBeTruthy();
    expect(screen.queryByText('Emerald Satin Wrap Dress')).toBeNull();

    // Reset category
    fireEvent.change(categorySelect, { target: { value: 'all' } });

    // Filter by gender
    fireEvent.change(genderSelect, { target: { value: 'male' } });
    expect(screen.getByText('Terracotta Linen Overshirt')).toBeTruthy();
    expect(screen.queryByText('Emerald Satin Wrap Dress')).toBeNull();

    // Reset gender
    fireEvent.change(genderSelect, { target: { value: 'all' } });

    // Filter by status: Inactive
    fireEvent.click(screen.getByRole('button', { name: /^Inactive$/i }));
    expect(screen.getByText('Emerald Satin Wrap Dress')).toBeTruthy();
    expect(screen.queryByText('Terracotta Linen Overshirt')).toBeNull();

    // Filter by status: Active
    fireEvent.click(screen.getByRole('button', { name: /^Active$/i }));
    expect(screen.getByText('Terracotta Linen Overshirt')).toBeTruthy();
    expect(screen.getByText('Relaxed Wide-Leg Trousers')).toBeTruthy();
    expect(screen.queryByText('Emerald Satin Wrap Dress')).toBeNull();
  });

  it('opens Slide-Over Drawer in create mode, uploads and crops photo, configures tags, and calls onCreateProduct', async () => {
    const onCreateProduct = vi.fn();
    const onUploadPhoto = vi.fn().mockResolvedValue({
      imagePath: '/uploads/products/new-blazer.jpg',
      previewUrl: 'data:image/jpeg;base64,mockpreviewdata',
    });

    render(
      <ProductCatalogSection
        products={sampleProducts}
        onCreateProduct={onCreateProduct}
        onUploadPhoto={onUploadPhoto}
      />,
    );

    // Click "+ Tambah Produk Baru"
    fireEvent.click(
      screen.getByRole('button', { name: /\+ Tambah Produk Baru/i }),
    );

    // Drawer should open with role="dialog"
    const drawer = screen.getByRole('dialog', { name: /Tambah Produk Baru/i });
    expect(drawer).toBeTruthy();

    // Category select should be grouped
    const categorySelect = screen.getByLabelText(/Category/i) as HTMLSelectElement;
    expect(categorySelect.options.length).toBeGreaterThan(4);
    fireEvent.change(categorySelect, { target: { value: 'outerwear' } });

    // Gender radios
    const priaRadio = screen.getByLabelText(/Pria/i);
    const wanitaRadio = screen.getByLabelText(/Wanita/i);
    fireEvent.click(wanitaRadio);
    expect(screen.getByText(/Hourglass \(Jam Pasir\)/i)).toBeTruthy();
    expect(screen.queryByText(/Trapezoid \(Trapesium\)/i)).toBeNull();

    fireEvent.click(priaRadio);
    expect(screen.getByText(/Trapezoid \(Trapesium\)/i)).toBeTruthy();
    expect(screen.queryByText(/Hourglass \(Jam Pasir\)/i)).toBeNull();

    // Toggle matching tags
    fireEvent.click(
      within(drawer).getByRole('button', {
        name: /Trapezoid \(Trapesium\)/i,
      }),
    );
    fireEvent.click(
      within(drawer).getByRole('button', { name: /^Autumn$/i }),
    );
    fireEvent.click(
      within(drawer).getByRole('button', { name: /^L$/i }),
    );

    // Upload photo (triggers 3:4 cropper modal)
    const fileInput = screen.getByLabelText(/Upload Foto Produk/i);
    const mockFile = new File(['mock content'], 'blazer.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    // Confirm crop in 3:4 modal
    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Potong & Gunakan Foto/i }),
      );
    });

    expect(onUploadPhoto).toHaveBeenCalledWith(mockFile);

    // Fill product name & source url
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: 'Wool Blend Tailored Blazer' },
    });
    fireEvent.change(screen.getByLabelText(/Brand/i), {
      target: { value: 'FLICKS Studio' },
    });
    fireEvent.change(screen.getByLabelText(/Link Produk \(Store URL\)/i), {
      target: { value: 'https://shopee.co.id/flicks/blazer' },
    });

    // Submit form
    const submitBtn = screen.getByRole('button', {
      name: /Tambah ke Katalog/i,
    });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(onCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wool Blend Tailored Blazer',
        brand: 'FLICKS Studio',
        category: 'outerwear',
        imagePath: '/uploads/products/new-blazer.jpg',
        sourceUrl: 'https://shopee.co.id/flicks/blazer',
        labels: expect.objectContaining({
          gender: 'male',
          body_shapes: ['trapezoid'],
          color_tones: ['autumn'],
          sizes: ['L'],
        }),
      }),
    );

    // Drawer should close after submit
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens Slide-Over Drawer in edit mode, edits fields, re-crops existing photo, and calls onUpdateProduct', async () => {
    const onUpdateProduct = vi.fn();
    const onUploadPhoto = vi.fn().mockResolvedValue({
      imagePath: '/uploads/products/recropped.jpg',
      previewUrl: 'data:image/jpeg;base64,recroppedpreview',
    });

    render(
      <ProductCatalogSection
        products={sampleProducts}
        onUpdateProduct={onUpdateProduct}
        onUploadPhoto={onUploadPhoto}
      />,
    );

    // Click Edit on second product (Emerald Satin Wrap Dress)
    const editBtns = screen.getAllByRole('button', { name: /^Edit$/i });
    fireEvent.click(editBtns[1]!);

    const drawer = screen.getByRole('dialog', { name: /Edit Produk/i });
    expect(drawer).toBeTruthy();

    const nameInput = screen.getByLabelText(/Edit Product Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Emerald Satin Wrap Dress');
    fireEvent.change(nameInput, {
      target: { value: 'Emerald Satin Wrap Dress (2026 Edition)' },
    });

    // Test re-crop of existing photo
    const cropExistingBtn = screen.getByRole('button', {
      name: /Sesuaikan \/ Crop Foto Saat Ini \(3:4\)/i,
    });
    fireEvent.click(cropExistingBtn);

    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Potong & Gunakan Foto/i }),
      );
    });

    // Toggle active checkbox
    const activeCheckbox = screen.getByLabelText(
      /Aktif \(tampilkan produk ke user di rekomendasi & VTO\)/i,
    ) as HTMLInputElement;
    expect(activeCheckbox.checked).toBe(false); // was inactive
    fireEvent.click(activeCheckbox);
    expect(activeCheckbox.checked).toBe(true);

    // Save changes
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));
    });

    expect(onUpdateProduct).toHaveBeenCalledWith(
      'prod-2',
      expect.objectContaining({
        name: 'Emerald Satin Wrap Dress (2026 Edition)',
        isActive: true,
      }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens AdminConfirmDialog when Hapus is clicked and confirms permanent deletion', () => {
    const onDeleteProduct = vi.fn();

    render(
      <ProductCatalogSection
        products={sampleProducts}
        onDeleteProduct={onDeleteProduct}
      />,
    );

    const deleteBtns = screen.getAllByRole('button', { name: /^Hapus$/i });
    fireEvent.click(deleteBtns[0]!);

    // Confirmation dialog should appear
    expect(screen.getByText('Hapus Produk dari Katalog?')).toBeTruthy();
    expect(
      screen.getByText(
        /Apakah Anda yakin ingin menghapus produk "Terracotta Linen Overshirt"\?/i,
      ),
    ).toBeTruthy();

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: /Ya, Hapus Permanen/i }));
    expect(onDeleteProduct).toHaveBeenCalledWith('prod-1');

    // Dialog closes
    expect(screen.queryByText('Hapus Produk dari Katalog?')).toBeNull();
  });

  it('toggles product active status when status toggle badge is clicked', async () => {
    const onDeactivateProduct = vi.fn();
    const onUpdateProduct = vi.fn();

    render(
      <ProductCatalogSection
        products={sampleProducts}
        onDeactivateProduct={onDeactivateProduct}
        onUpdateProduct={onUpdateProduct}
      />,
    );

    const statusBtns = screen.getAllByRole('button', { name: /Ubah status/i });

    // Click Active on prod-1 -> calls onDeactivateProduct
    await act(async () => {
      fireEvent.click(statusBtns[0]!);
    });
    expect(onDeactivateProduct).toHaveBeenCalledWith('prod-1');

    // Click Inactive on prod-2 -> calls onUpdateProduct({ isActive: true })
    await act(async () => {
      fireEvent.click(statusBtns[1]!);
    });
    expect(onUpdateProduct).toHaveBeenCalledWith('prod-2', { isActive: true });
  });

  it('closes Slide-Over Drawer on Escape key or backdrop click or close button', () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <ProductCatalogDrawer
        isOpen={true}
        mode="create"
        onClose={onClose}
      />,
    );

    // Close button
    fireEvent.click(screen.getByLabelText('Tutup panel produk'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backdrop click
    const backdrop = screen.getByTestId('product-drawer-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    // When isOpen is false, returns null
    rerender(
      <ProductCatalogDrawer
        isOpen={false}
        mode="create"
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
