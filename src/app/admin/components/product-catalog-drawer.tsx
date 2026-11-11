'use client';

import React, { useEffect, useState } from 'react';
import styles from '../admin.module.css';
import { ImageCropperModal } from '../image-cropper-modal';
import type {
  CatalogProductRecord,
  CreateProductInput,
  ProductGender,
  UpdateProductInput,
} from '@/server/admin/admin.service';
import type { PrimarySeason } from '@/server/analysis/schemas';
import {
  COLOR_TONE_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  SIZE_OPTIONS,
  getBodyShapesForGender,
} from '../admin-formatters';
import {
  BODY_SHAPE_LABELS,
  type BodyShapeCategory,
} from '@/shared/body-shape-labels';

export interface ProductCatalogDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  product?: CatalogProductRecord | null;
  onClose: () => void;
  onSubmitCreate?: (input: CreateProductInput) => void | Promise<void>;
  onSubmitEdit?: (
    productId: string,
    patch: UpdateProductInput,
  ) => void | Promise<void>;
  onUploadPhoto?: (
    file: File,
  ) => Promise<{ imagePath: string; previewUrl: string }>;
}

type CropTarget =
  | { mode: 'file'; file: File; target: 'create' | 'edit' }
  | { mode: 'existing-edit'; imageUrl: string; fileName: string };

export function ProductCatalogDrawer({
  isOpen,
  mode,
  product,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
  onUploadPhoto,
}: ProductCatalogDrawerProps) {
  // Form fields
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('tops');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [gender, setGender] = useState<ProductGender>('unisex');
  const [selectedBodyShapes, setSelectedBodyShapes] = useState<
    BodyShapeCategory[]
  >([]);
  const [selectedColorTones, setSelectedColorTones] = useState<
    PrimarySeason[]
  >([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [isActive, setIsActive] = useState<boolean>(true);

  // Upload & Cropping state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

  // Initialize form state when opening or when mode/product changes
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && product) {
      setName(product.name);
      setBrand(product.brand ?? '');
      setCategory(product.category || 'tops');
      setSourceUrl(product.sourceUrl ?? '');
      setImagePath(product.imagePath);
      setPreviewUrl(
        typeof product.labels?.preview_url === 'string'
          ? product.labels.preview_url
          : product.imagePath,
      );
      setGender(
        (product.labels?.gender as ProductGender | undefined) ?? 'unisex',
      );
      setSelectedBodyShapes(
        Array.isArray(product.labels?.body_shapes)
          ? (product.labels.body_shapes as BodyShapeCategory[])
          : [],
      );
      setSelectedColorTones(
        Array.isArray(product.labels?.color_tones)
          ? (product.labels.color_tones as PrimarySeason[])
          : [],
      );
      setSelectedSizes(
        Array.isArray(product.labels?.sizes) ? product.labels.sizes : [],
      );
      setIsActive(product.isActive);
    } else {
      setName('');
      setBrand('');
      setCategory('tops');
      setSourceUrl('');
      setImagePath('');
      setPreviewUrl(null);
      setGender('unisex');
      setSelectedBodyShapes([]);
      setSelectedColorTones([]);
      setSelectedSizes([]);
      setIsActive(true);
    }
    setUploadError(null);
    setIsUploading(false);
    setCropTarget(null);
  }, [isOpen, mode, product]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cropTarget) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cropTarget, onClose]);

  if (!isOpen) return null;

  const availableBodyShapes = getBodyShapesForGender(gender);

  const handleGenderChange = (nextGender: ProductGender) => {
    setGender(nextGender);
    const allowed = new Set(getBodyShapesForGender(nextGender));
    setSelectedBodyShapes((prev) => prev.filter((shape) => allowed.has(shape)));
  };

  const toggleBodyShape = (shape: BodyShapeCategory) => {
    setSelectedBodyShapes((prev) =>
      prev.includes(shape)
        ? prev.filter((item) => item !== shape)
        : [...prev, shape],
    );
  };

  const toggleColorTone = (tone: PrimarySeason) => {
    setSelectedColorTones((prev) =>
      prev.includes(tone)
        ? prev.filter((item) => item !== tone)
        : [...prev, tone],
    );
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size)
        ? prev.filter((item) => item !== size)
        : [...prev, size],
    );
  };

  const processPhotoUpload = async (file: File) => {
    setUploadError(null);

    if (onUploadPhoto) {
      setIsUploading(true);
      try {
        const result = await onUploadPhoto(file);
        setImagePath(result.imagePath);
        setPreviewUrl(result.previewUrl);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Gagal mengunggah foto produk.',
        );
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Fallback when onUploadPhoto is not provided
    setImagePath(`/uploads/products/${file.name}`);
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handlePhotoInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCropTarget({ mode: 'file', file, target: mode });
    event.target.value = '';
  };

  const handleCropExistingPhoto = () => {
    if (!previewUrl) return;
    setCropTarget({
      mode: 'existing-edit',
      imageUrl: previewUrl,
      fileName: `${name.replace(/\s+/g, '-').toLowerCase() || 'product'}.jpg`,
    });
  };

  const handleCropConfirm = async (croppedFile: File) => {
    setCropTarget(null);
    await processPhotoUpload(croppedFile);
  };

  const handleCropCancel = () => {
    setCropTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create') {
      if (onSubmitCreate) {
        await onSubmitCreate({
          name,
          brand: brand || null,
          category,
          subcategory: null,
          imagePath: imagePath || '/uploads/products/placeholder.jpg',
          sourceUrl: sourceUrl || null,
          labels: {
            gender,
            body_shapes: selectedBodyShapes,
            color_tones: selectedColorTones,
            sizes: selectedSizes,
            ...(previewUrl ? { preview_url: previewUrl } : {}),
          },
        });
      }
      onClose();
    } else if (mode === 'edit' && product) {
      if (onSubmitEdit) {
        await onSubmitEdit(product.id, {
          name,
          brand: brand || null,
          category,
          imagePath: imagePath || '/uploads/products/placeholder.jpg',
          sourceUrl: sourceUrl || null,
          isActive,
          labels: {
            gender,
            body_shapes: selectedBodyShapes,
            color_tones: selectedColorTones,
            sizes: selectedSizes,
            ...(previewUrl ? { preview_url: previewUrl } : {}),
          },
        });
      }
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !cropTarget) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={styles.drawerBackdrop}
        onClick={handleBackdropClick}
        data-testid="product-drawer-backdrop"
      >
        <div
          className={styles.drawerPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-drawer-title"
        >
          {/* Header */}
          <div className={styles.drawerHeader}>
            <h3 id="product-drawer-title" className={styles.drawerTitle}>
              {mode === 'create' ? 'Tambah Produk Baru' : 'Edit Produk'}
            </h3>
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.iconButton}`}
              onClick={onClose}
              aria-label="Tutup panel produk"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div className={styles.drawerBody}>
              {/* Photo Upload Zone */}
              <div className={styles.uploadZone}>
                <div className={styles.formField}>
                  <label
                    htmlFor={
                      mode === 'create'
                        ? 'prod-photo-create'
                        : 'edit-prod-photo'
                    }
                    className={styles.formLabel}
                  >
                    {mode === 'create'
                      ? 'Upload Foto Produk (JPG, PNG, WebP · rasio 3:4 · maks 5 MB)'
                      : 'Ganti Foto Produk (JPG, PNG, WebP · rasio 3:4 · maks 5 MB)'}
                  </label>
                  <input
                    id={
                      mode === 'create'
                        ? 'prod-photo-create'
                        : 'edit-prod-photo'
                    }
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.formInput}
                    onChange={handlePhotoInputChange}
                  />
                  {isUploading ? (
                    <span className={styles.metricSubtext}>
                      Mengunggah foto produk...
                    </span>
                  ) : null}
                  {uploadError ? (
                    <span className={styles.errorText} role="alert">
                      {uploadError}
                    </span>
                  ) : null}
                </div>

                {previewUrl ? (
                  <div className={styles.editThumbContainer}>
                    <img
                      src={previewUrl}
                      alt={
                        mode === 'create'
                          ? 'Preview Produk'
                          : 'Preview Edit Produk'
                      }
                      className={styles.previewThumbnail}
                      onError={(e) => {
                        // ponytail: fallback to placeholder if image fails to load
                        e.currentTarget.src =
                          '/uploads/products/placeholder.jpg';
                      }}
                    />
                    {mode === 'edit' ? (
                      <button
                        type="button"
                        className={styles.cropExistingButton}
                        onClick={handleCropExistingPhoto}
                      >
                        📐 Sesuaikan / Crop Foto Saat Ini (3:4)
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Form Grid: Name, Brand, Category, Store URL */}
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label
                    htmlFor={mode === 'create' ? 'prod-name' : 'edit-prod-name'}
                    className={styles.formLabel}
                  >
                    {mode === 'create' ? 'Product Name' : 'Edit Product Name'}
                  </label>
                  <input
                    id={mode === 'create' ? 'prod-name' : 'edit-prod-name'}
                    className={styles.formInput}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Linen Overshirt Terracotta"
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label
                    htmlFor={
                      mode === 'create' ? 'prod-brand' : 'edit-prod-brand'
                    }
                    className={styles.formLabel}
                  >
                    {mode === 'create' ? 'Brand' : 'Edit Brand'}
                  </label>
                  <input
                    id={mode === 'create' ? 'prod-brand' : 'edit-prod-brand'}
                    className={styles.formInput}
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Contoh: Flicks Essentials"
                  />
                </div>

                <div className={styles.formField}>
                  <label
                    htmlFor={
                      mode === 'create'
                        ? 'prod-category'
                        : 'edit-prod-category'
                    }
                    className={styles.formLabel}
                  >
                    {mode === 'create' ? 'Category' : 'Edit Category'}
                  </label>
                  <select
                    id={
                      mode === 'create'
                        ? 'prod-category'
                        : 'edit-prod-category'
                    }
                    className={styles.formInput}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  >
                    <optgroup label="Kelompok Atasan (Tops di Pengguna)">
                      {PRODUCT_CATEGORY_OPTIONS.filter(
                        (opt) => opt.group === 'tops',
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelompok Bawahan (Bottoms di Pengguna)">
                      {PRODUCT_CATEGORY_OPTIONS.filter(
                        (opt) => opt.group === 'bottoms',
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className={styles.formField}>
                  <label
                    htmlFor={
                      mode === 'create' ? 'prod-source' : 'edit-prod-source'
                    }
                    className={styles.formLabel}
                  >
                    {mode === 'create'
                      ? 'Link Produk (Store URL)'
                      : 'Edit Link Produk (Store URL)'}
                  </label>
                  <input
                    id={mode === 'create' ? 'prod-source' : 'edit-prod-source'}
                    type="url"
                    className={styles.formInput}
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://shopee.co.id/..."
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Matching Section: Gender, Body Shapes, Color Tones, Sizes */}
              <div className={styles.matchingSection}>
                <fieldset className={styles.fieldsetGroup}>
                  <legend className={styles.formLabel}>Gender Pakaian</legend>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={
                          mode === 'create'
                            ? 'prod-gender'
                            : 'edit-prod-gender'
                        }
                        value="male"
                        checked={gender === 'male'}
                        onChange={() => handleGenderChange('male')}
                      />
                      <span>Pria (Male)</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={
                          mode === 'create'
                            ? 'prod-gender'
                            : 'edit-prod-gender'
                        }
                        value="female"
                        checked={gender === 'female'}
                        onChange={() => handleGenderChange('female')}
                      />
                      <span>Wanita (Female)</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={
                          mode === 'create'
                            ? 'prod-gender'
                            : 'edit-prod-gender'
                        }
                        value="unisex"
                        checked={gender === 'unisex'}
                        onChange={() => handleGenderChange('unisex')}
                      />
                      <span>Unisex</span>
                    </label>
                  </div>
                </fieldset>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>
                    Tipe Body Shape yang Cocok
                  </span>
                  <div
                    className={styles.chipGroup}
                    role="group"
                    aria-label="Body Shape"
                  >
                    {availableBodyShapes.map((shapeKey) => {
                      const active = selectedBodyShapes.includes(shapeKey);
                      return (
                        <button
                          key={shapeKey}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleBodyShape(shapeKey)}
                        >
                          {BODY_SHAPE_LABELS[shapeKey]?.display ?? shapeKey}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>
                    Personal Color Tone yang Cocok
                  </span>
                  <div
                    className={styles.chipGroup}
                    role="group"
                    aria-label="Personal Color Tone"
                  >
                    {COLOR_TONE_OPTIONS.map((tone) => {
                      const active = selectedColorTones.includes(tone.key);
                      return (
                        <button
                          key={tone.key}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleColorTone(tone.key)}
                        >
                          {tone.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>Ukuran Tersedia</span>
                  <div
                    className={styles.chipGroup}
                    role="group"
                    aria-label="Ukuran"
                  >
                    {SIZE_OPTIONS.map((size) => {
                      const active = selectedSizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={active}
                          className={`${styles.chip} ${
                            active ? styles.chipActive : ''
                          }`}
                          onClick={() => toggleSize(size)}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mode === 'edit' ? (
                  <div className={styles.formField}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                      />
                      <span>
                        Aktif (tampilkan produk ke user di rekomendasi &amp;
                        VTO)
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Sticky Footer */}
            <div className={styles.drawerFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
              >
                Batal
              </button>
              <button type="submit" className={styles.primaryButton}>
                {mode === 'create'
                  ? 'Tambah ke Katalog'
                  : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {cropTarget ? (
        <ImageCropperModal
          file={cropTarget.mode === 'file' ? cropTarget.file : undefined}
          imageUrl={
            cropTarget.mode !== 'file' ? cropTarget.imageUrl : undefined
          }
          fileName={
            cropTarget.mode !== 'file' ? cropTarget.fileName : undefined
          }
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      ) : null}
    </>
  );
}
