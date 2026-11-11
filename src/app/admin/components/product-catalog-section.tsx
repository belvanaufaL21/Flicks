'use client';

import React, { useMemo, useState } from 'react';
import styles from '../admin.module.css';
import { AdminConfirmDialog } from './admin-confirm-dialog';
import { ProductCatalogDrawer } from './product-catalog-drawer';
import type {
  CatalogProductRecord,
  CreateProductInput,
  ProductGender,
  UpdateProductInput,
} from '@/server/admin/admin.service';
import {
  PRODUCT_CATEGORY_OPTIONS,
  isBottomsCategory,
} from '../admin-formatters';
import {
  BODY_SHAPE_LABELS,
  type BodyShapeCategory,
} from '@/shared/body-shape-labels';

export interface ProductCatalogSectionProps {
  products: CatalogProductRecord[];
  onCreateProduct?: (input: CreateProductInput) => void | Promise<void>;
  onUpdateProduct?: (
    productId: string,
    patch: UpdateProductInput,
  ) => void | Promise<void>;
  onDeleteProduct?: (productId: string) => void | Promise<void>;
  onDeactivateProduct?: (productId: string) => void | Promise<void>;
  onUploadPhoto?: (
    file: File,
  ) => Promise<{ imagePath: string; previewUrl: string }>;
}

export function ProductCatalogSection({
  products,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onDeactivateProduct,
  onUploadPhoto,
}: ProductCatalogSectionProps) {
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingProduct, setEditingProduct] = useState<CatalogProductRecord | null>(null);

  // Status toggle state
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingProduct, setDeletingProduct] = useState<CatalogProductRecord | null>(null);

  // Filtered products calculation
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((prod) => {
      if (q) {
        const matchesName = prod.name.toLowerCase().includes(q);
        const matchesBrand = (prod.brand ?? '').toLowerCase().includes(q);
        const matchesCat = prod.category.toLowerCase().includes(q);
        const matchesSubcat = (prod.subcategory ?? '').toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesCat && !matchesSubcat) {
          return false;
        }
      }

      if (categoryFilter !== 'all' && prod.category !== categoryFilter) {
        return false;
      }

      if (genderFilter !== 'all') {
        const prodGender =
          (prod.labels?.gender as ProductGender | undefined) ?? 'unisex';
        if (prodGender !== genderFilter) {
          return false;
        }
      }

      if (statusFilter === 'active' && !prod.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && prod.isActive) {
        return false;
      }

      return true;
    });
  }, [products, searchQuery, categoryFilter, genderFilter, statusFilter]);

  const handleOpenCreateDrawer = () => {
    setDrawerMode('create');
    setEditingProduct(null);
    setDrawerOpen(true);
  };

  const handleOpenEditDrawer = (prod: CatalogProductRecord) => {
    setDrawerMode('edit');
    setEditingProduct(prod);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setEditingProduct(null);
  };

  const handleToggleStatus = async (prod: CatalogProductRecord) => {
    if (togglingProductId) return;
    setTogglingProductId(prod.id);
    try {
      if (prod.isActive) {
        if (onDeactivateProduct) {
          await onDeactivateProduct(prod.id);
        } else if (onUpdateProduct) {
          await onUpdateProduct(prod.id, { isActive: false });
        }
      } else if (onUpdateProduct) {
        await onUpdateProduct(prod.id, { isActive: true });
      }
    } finally {
      setTogglingProductId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    const targetId = deletingProduct.id;
    setDeletingProduct(null);
    if (onDeleteProduct) {
      await onDeleteProduct(targetId);
    } else if (onDeactivateProduct) {
      await onDeactivateProduct(targetId);
    }
  };

  return (
    <section className={styles.sectionCard} aria-label="Product Catalog Management">
      {/* Header & Subtitle */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 className={styles.sectionHeading}>Product Catalog Management</h2>
        <p className={styles.metricSubtext}>
          Kelola pakaian untuk Virtual Try-On dan Personal Color rekomendasi. Rasio foto wajib 3:4.
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cari nama produk, brand, atau kategori…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari produk"
          />

          <select
            className={styles.filterSelect}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter kategori"
          >
            <option value="all">Semua Kategori</option>
            <optgroup label="Kelompok Atasan (Tops)">
              {PRODUCT_CATEGORY_OPTIONS.filter((opt) => opt.group === 'tops').map(
                (opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ),
              )}
            </optgroup>
            <optgroup label="Kelompok Bawahan (Bottoms)">
              {PRODUCT_CATEGORY_OPTIONS.filter(
                (opt) => opt.group === 'bottoms',
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          </select>

          <select
            className={styles.filterSelect}
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            aria-label="Filter gender"
          >
            <option value="all">Semua Gender</option>
            <option value="male">Pria</option>
            <option value="female">Wanita</option>
            <option value="unisex">Unisex</option>
          </select>

          <div className={styles.periodFilterGroup} role="group" aria-label="Filter status produk">
            <button
              type="button"
              className={`${styles.periodChip} ${
                statusFilter === 'all' ? styles.periodChipActive : ''
              }`}
              onClick={() => setStatusFilter('all')}
            >
              Semua
            </button>
            <button
              type="button"
              className={`${styles.periodChip} ${
                statusFilter === 'active' ? styles.periodChipActive : ''
              }`}
              onClick={() => setStatusFilter('active')}
            >
              Active
            </button>
            <button
              type="button"
              className={`${styles.periodChip} ${
                statusFilter === 'inactive' ? styles.periodChipActive : ''
              }`}
              onClick={() => setStatusFilter('inactive')}
            >
              Inactive
            </button>
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleOpenCreateDrawer}
          >
            + Tambah Produk Baru
          </button>
        </div>
      </div>

      {/* Catalog Table */}
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th className={styles.tableHeaderCell}>Photo</th>
            <th className={styles.tableHeaderCell}>Name &amp; Brand</th>
            <th className={styles.tableHeaderCell}>Category</th>
            <th className={styles.tableHeaderCell}>Gender</th>
            <th className={styles.tableHeaderCell}>Matching Tags</th>
            <th className={styles.tableHeaderCell}>Sizes</th>
            <th className={styles.tableHeaderCell}>Store Link</th>
            <th className={styles.tableHeaderCell}>Status</th>
            <th className={styles.tableHeaderCell}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                style={{
                  textAlign: 'center',
                  padding: '2.5rem 1rem',
                  color: '#64748B',
                }}
              >
                Tidak ada produk yang cocok dengan pencarian atau filter yang dipilih.
              </td>
            </tr>
          ) : (
            filteredProducts.map((prod) => {
              const prodGender =
                (prod.labels?.gender as ProductGender | undefined) ?? 'unisex';
              const bodyShapes = Array.isArray(prod.labels?.body_shapes)
                ? (prod.labels.body_shapes as string[])
                : [];
              const colorTones = Array.isArray(prod.labels?.color_tones)
                ? (prod.labels.color_tones as string[])
                : [];
              const sizes = Array.isArray(prod.labels?.sizes)
                ? prod.labels.sizes
                : [];
              const thumbSrc =
                typeof prod.labels?.preview_url === 'string' &&
                prod.labels.preview_url
                  ? prod.labels.preview_url
                  : prod.imagePath;

              const genderBadgeClass =
                prodGender === 'male'
                  ? styles.badgeMale
                  : prodGender === 'female'
                    ? styles.badgeFemale
                    : styles.badgeUnisex;
              const genderLabel =
                prodGender === 'male'
                  ? 'Pria'
                  : prodGender === 'female'
                    ? 'Wanita'
                    : 'Unisex';

              return (
                <tr key={prod.id}>
                  <td className={styles.tableCell}>
                    <img
                      src={thumbSrc}
                      alt={prod.name}
                      className={styles.tableThumb}
                      onError={(e) => {
                        // ponytail: fallback to placeholder if image fails to load
                        e.currentTarget.src =
                          '/uploads/products/placeholder.jpg';
                      }}
                    />
                  </td>
                  <td className={styles.tableCell}>
                    <div>{prod.name}</div>
                    <div className={styles.metricSubtext}>
                      {prod.brand ?? '—'}
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <div>{prod.category}</div>
                    <div className={styles.metricSubtext}>
                      Kelompok:{' '}
                      {isBottomsCategory(prod.category)
                        ? 'Bottoms (Bawahan)'
                        : 'Tops (Atasan)'}
                    </div>
                    {prod.subcategory ? (
                      <div className={styles.metricSubtext}>
                        {prod.subcategory}
                      </div>
                    ) : null}
                  </td>
                  <td className={styles.tableCell}>
                    <span className={`${styles.badge} ${genderBadgeClass}`}>
                      {genderLabel}
                    </span>
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.tagWrap}>
                      {bodyShapes.map((shape) => (
                        <span key={`bs-${shape}`} className={styles.tagPill}>
                          {BODY_SHAPE_LABELS[shape as BodyShapeCategory]?.en ??
                            shape}
                        </span>
                      ))}
                      {colorTones.map((tone) => (
                        <span key={`ct-${tone}`} className={styles.tagPill}>
                          {tone}
                        </span>
                      ))}
                      {bodyShapes.length === 0 && colorTones.length === 0
                        ? '—'
                        : null}
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    {sizes.length > 0 ? sizes.join(', ') : '—'}
                  </td>
                  <td className={styles.tableCell}>
                    {prod.sourceUrl ? (
                      <a
                        href={prod.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.storeLink}
                      >
                        Lihat Produk ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={styles.tableCell}>
                    <button
                      type="button"
                      className={`${styles.statusToggleBadge} ${
                        prod.isActive
                          ? styles.statusToggleActive
                          : styles.statusToggleInactive
                      }`}
                      onClick={() => void handleToggleStatus(prod)}
                      disabled={togglingProductId === prod.id}
                      title={
                        prod.isActive
                          ? 'Klik untuk Nonaktifkan (sembunyikan dari user)'
                          : 'Klik untuk Aktifkan (tampilkan ke user)'
                      }
                      aria-label={`Ubah status ${prod.name} (${
                        prod.isActive ? 'Active' : 'Inactive'
                      })`}
                    >
                      <span
                        className={`${styles.statusDot} ${
                          prod.isActive
                            ? styles.statusDotActive
                            : styles.statusDotInactive
                        }`}
                        aria-hidden="true"
                      />
                      {prod.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.actionGroup}>
                      <button
                        type="button"
                        aria-label="Edit"
                        title="Edit Produk"
                        className={`${styles.secondaryButton} ${styles.iconButton}`}
                        onClick={() => handleOpenEditDrawer(prod)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label="Hapus"
                        title="Hapus Produk"
                        className={`${styles.dangerButton} ${styles.iconButton}`}
                        onClick={() => setDeletingProduct(prod)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Slide-Over Drawer */}
      <ProductCatalogDrawer
        isOpen={drawerOpen}
        mode={drawerMode}
        product={editingProduct}
        onClose={handleCloseDrawer}
        onSubmitCreate={onCreateProduct}
        onSubmitEdit={onUpdateProduct}
        onUploadPhoto={onUploadPhoto}
      />

      {/* Confirmation Dialog for Delete */}
      {deletingProduct ? (
        <AdminConfirmDialog
          title="Hapus Produk dari Katalog?"
          description={`Apakah Anda yakin ingin menghapus produk "${deletingProduct.name}"? Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Ya, Hapus Permanen"
          cancelLabel="Batal"
          tone="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingProduct(null)}
        />
      ) : null}
    </section>
  );
}
