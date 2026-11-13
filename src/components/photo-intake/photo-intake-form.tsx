'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  BODY_SHAPE_LABELS,
  type BodyShapeCategory,
  type GenderType,
} from '@/shared/body-shape-labels';
import { PHOTO_POLICY, type PhotoKind } from '@/shared/photo-policy';
import { validatePhotoFile } from './photo-file-validation';
import styles from './photo-intake-form.module.css';

interface SelectedPhoto {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface LiveAnalysisResult {
  jobStatus: string;
  personal_color: {
    primary_season: string;
    sub_season: string | null;
    confidence_level: string;
    alternative_candidates?: string[];
    recommended_colors: string[];
    disclaimer?: string;
  };
  body_shape: {
    category: string;
    confidence_level: string;
    alternative_candidates?: string[];
    styling_guidance: string[];
    disclaimer?: string;
  };
}

export interface RecommendedCatalogItem {
  id: string;
  name: string;
  brand?: string | null;
  category: 'tops' | 'bottoms';
  imagePath: string;
  sourceUrl?: string | null;
}

export interface PurchasedTokenCredential {
  tokenId: string;
  tokenSecret: string;
}

export interface PhotoIntakeFormProps {
  initialAnalysisComplete?: {
    gender: string;
    bodyShape: string;
    colorSeason: string;
    userPhotoUri: string;
    tokenId: string;
  };
  purchasedToken?: PurchasedTokenCredential | null;
  requirePurchasedToken?: boolean;
}

type PhotoSlots = Record<PhotoKind, SelectedPhoto | null>;
type PhotoErrors = Partial<Record<PhotoKind, string>>;

const initialPhotos: PhotoSlots = { face: null, fullBody: null };

function validationMessage(code: string): string {
  switch (code) {
    case 'unsupported_type':
      return 'Gunakan foto JPEG, PNG, atau WebP.';
    case 'mime_mismatch':
      return 'Format isi file tidak sesuai dengan tipe foto yang dipilih.';
    case 'file_too_large':
      return 'Ukuran foto maksimal 10 MB.';
    case 'dimensions_out_of_range':
      return 'Dimensi foto harus 512–4096 piksel pada sisi terpendek dan terpanjang.';
    case 'too_many_files':
      return 'Pilih maksimal 1 foto untuk setiap bagian.';
    default:
      return 'Foto tidak dapat dibaca. Coba pilih file gambar lain.';
  }
}

export function PhotoIntakeForm({
  initialAnalysisComplete,
  purchasedToken = null,
  requirePurchasedToken = false,
}: PhotoIntakeFormProps = {}) {
  const [photos, setPhotos] = useState<PhotoSlots>(initialPhotos);
  const [errors, setErrors] = useState<PhotoErrors>({});
  const [status, setStatus] = useState('');
  const [consent, setConsent] = useState(false);
  const [gender, setGender] = useState<GenderType | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<LiveAnalysisResult | null>(null);
  const [recommendations, setRecommendations] = useState<{
    tops: RecommendedCatalogItem[];
    bottoms: RecommendedCatalogItem[];
  } | null>(null);
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
  const [selectedBottomId, setSelectedBottomId] = useState<string | null>(null);
  const [vtoQuota, setVtoQuota] = useState({
    canTryTop: true,
    canTryBottom: true,
  });
  const [vtoRunning, setVtoRunning] = useState(false);
  const [vtoStepMessage, setVtoStepMessage] = useState<string | null>(null);
  const [vtoOutputUri, setVtoOutputUri] = useState<string | null>(null);
  const [vtoWarning, setVtoWarning] = useState<string | null>(null);
  const [activeTokenSecret, setActiveTokenSecret] = useState<string | null>(
    initialAnalysisComplete?.tokenId ?? null,
  );
  const [uploadedBodyPhotoPath, setUploadedBodyPhotoPath] = useState<
    string | null
  >(initialAnalysisComplete?.userPhotoUri ?? null);
  const ready = photos.face !== null && photos.fullBody !== null;
  const isCheckoutLocked = requirePurchasedToken && !purchasedToken;

  useEffect(() => {
    if (!purchasedToken) return;
    setActiveTokenSecret(purchasedToken.tokenSecret);
    setVtoQuota({ canTryTop: true, canTryBottom: true });
    setVtoOutputUri(null);
    setVtoWarning(null);
    setVtoStepMessage(null);
  }, [purchasedToken]);

  useEffect(() => {
    if (!initialAnalysisComplete) return;
    let cancelled = false;
    async function loadInitialRecommendations() {
      try {
        const res = await fetch(
          `/api/recommendations?gender=${encodeURIComponent(initialAnalysisComplete!.gender)}&body_shape=${encodeURIComponent(initialAnalysisComplete!.bodyShape)}&color_season=${encodeURIComponent(initialAnalysisComplete!.colorSeason)}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          recommendations?: {
            tops: RecommendedCatalogItem[];
            bottoms: RecommendedCatalogItem[];
          };
          tops?: RecommendedCatalogItem[];
          bottoms?: RecommendedCatalogItem[];
        };
        const recs =
          data.recommendations ??
          (data.tops && data.bottoms
            ? { tops: data.tops, bottoms: data.bottoms }
            : null);
        if (!cancelled && recs) {
          setRecommendations(recs);
        }
      } catch {
        // Ignore fetch errors in non-network environments
      }
    }
    void loadInitialRecommendations();
    return () => {
      cancelled = true;
    };
  }, [initialAnalysisComplete]);

  useEffect(() => {
    const activeToken =
      purchasedToken?.tokenId ||
      initialAnalysisComplete?.tokenId ||
      activeTokenSecret;
    if (!activeToken || typeof window === 'undefined') return;
    try {
      const cached = sessionStorage.getItem(`flicks_vto_${activeToken}`);
      if (cached) {
        setVtoOutputUri(cached);
        setVtoQuota({ canTryTop: false, canTryBottom: false });
      }
    } catch {
      // Ignore storage access errors
    }
  }, [purchasedToken?.tokenId, initialAnalysisComplete?.tokenId, activeTokenSecret]);

  useEffect(
    () => () => {
      Object.values(photos).forEach((photo) => {
        if (photo) URL.revokeObjectURL(photo.previewUrl);
      });
    },
    [photos],
  );

  async function handleFileChange(
    kind: PhotoKind,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (isCheckoutLocked) {
      event.currentTarget.value = '';
      return;
    }
    const files = event.currentTarget.files;
    const fileCount = files?.length ?? 0;
    const file = files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setStatus('');
    if (fileCount > PHOTO_POLICY.maxCount[kind]) {
      setErrors((current) => ({
        ...current,
        [kind]: validationMessage('too_many_files'),
      }));
      return;
    }

    const result = await validatePhotoFile(file);
    if (!result.ok) {
      setErrors((current) => ({
        ...current,
        [kind]: validationMessage(result.code),
      }));
      return;
    }

    const selectedPhoto: SelectedPhoto = {
      file,
      previewUrl: URL.createObjectURL(file),
      width: result.width,
      height: result.height,
    };
    setErrors((current) => ({ ...current, [kind]: undefined }));
    setPhotos((current) => ({
      ...current,
      [kind]: selectedPhoto,
    }));
  }

  function removePhoto(kind: PhotoKind) {
    setPhotos((current) => ({ ...current, [kind]: null }));
    setErrors((current) => ({ ...current, [kind]: undefined }));
    setStatus('');
  }

  function simulateUpload() {
    if (!ready) return;
    setStatus(
      'Simulasi selesai. Tidak ada foto dikirim atau disimpan; file hanya berada di perangkat ini.',
    );
  }

  async function runLiveGeminiAnalysis() {
    if (
      isCheckoutLocked ||
      !ready ||
      !consent ||
      !gender ||
      !photos.face ||
      !photos.fullBody
    ) {
      return;
    }
    setAnalyzing(true);
    setAnalysisResult(null);
    setStatus(
      purchasedToken?.tokenSecret
        ? 'Mengunggah foto privat dengan token aktif...'
        : 'Menyiapkan token dev dan mengunggah foto ke server lokal...',
    );

    try {
      let secret = purchasedToken?.tokenSecret;
      if (!secret) {
        if (requirePurchasedToken) {
          setStatus(
            'Token analisis belum aktif. Selesaikan pembayaran Rp19.000 terlebih dahulu.',
          );
          return;
        }
        const tokenRes = await fetch('/api/dev/tokens?count=1');
        const tokenJson = (await tokenRes.json()) as {
          tokens?: Array<{ secret: string }>;
          message?: string;
        };
        secret = tokenJson.tokens?.[0]?.secret;
        if (!tokenRes.ok || !secret) {
          setStatus(tokenJson.message || 'Gagal membuat token dev.');
          return;
        }
      }

      const authHeader = { authorization: `Bearer ${secret}` };

      const uploadSlot = async (kind: PhotoKind, file: File) => {
        const fd = new FormData();
        fd.set('photo', file);
        fd.set('kind', kind);
        fd.set('consent', 'true');
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: authHeader,
          body: fd,
        });
        const body = (await res.json()) as {
          photo_path?: string;
          message?: string;
        };
        if (!res.ok || !body.photo_path) {
          throw new Error(body.message || `Gagal mengunggah foto ${kind}`);
        }
        return body.photo_path;
      };

      const [facePath, bodyPath] = await Promise.all([
        uploadSlot('face', photos.face.file),
        uploadSlot('fullBody', photos.fullBody.file),
      ]);

      setStatus('Menjalankan Analisis Personal Color & Body Shape via Gemini...');
      const createRes = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          ...authHeader,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: facePath,
          full_body_photo_path: bodyPath,
          gender,
          consent: true,
        }),
      });
      const createJson = (await createRes.json()) as {
        job_id?: string;
        message?: string;
      };
      if (!createRes.ok || !createJson.job_id) {
        setStatus(createJson.message || 'Gagal memulai job analisis.');
        return;
      }

      const pollRes = await fetch(`/api/analysis/${createJson.job_id}`, {
        headers: authHeader,
      });
      const pollJson = (await pollRes.json()) as {
        status?: string;
        result?: LiveAnalysisResult;
        error_detail?: string;
        message?: string;
      };

      if (pollJson.result) {
        setAnalysisResult({
          ...pollJson.result,
          jobStatus: pollJson.status ?? 'completed',
        });
        setActiveTokenSecret(secret);
        setUploadedBodyPhotoPath(bodyPath);
        setStatus(`Analisis selesai (${pollJson.status}).`);

        const colorSeason =
          pollJson.result.personal_color.sub_season ||
          pollJson.result.personal_color.primary_season ||
          '';
        const bodyShape = pollJson.result.body_shape.category || '';
        const recRes = await fetch(
          `/api/recommendations?gender=${encodeURIComponent(gender)}&body_shape=${encodeURIComponent(bodyShape)}&color_season=${encodeURIComponent(colorSeason)}`,
        );
        if (recRes.ok) {
          const recData = (await recRes.json()) as {
            recommendations?: {
              tops: RecommendedCatalogItem[];
              bottoms: RecommendedCatalogItem[];
            };
            tops?: RecommendedCatalogItem[];
            bottoms?: RecommendedCatalogItem[];
          };
          const recs =
            recData.recommendations ??
            (recData.tops && recData.bottoms
              ? { tops: recData.tops, bottoms: recData.bottoms }
              : null);
          if (recs) {
            setRecommendations(recs);
          }
        }
      } else if (pollJson.status === 'queued') {
        setStatus(
          'Job analisis tercatat (queued). Isi GEMINI_API_KEY di app/.env.local lalu restart server untuk melihat hasil Gemini nyata.',
        );
      } else {
        const detail = pollJson.error_detail || pollJson.message || '';
        // ponytail: basic string match; upgrade to structured error code enum when backend exposes typed error response
        if (detail.includes('503') || detail.toLowerCase().includes('high demand')) {
          setStatus(
            'Layanan AI Gemini sedang mengalami lonjakan trafik (503). Sistem telah mencoba model fallback, silakan klik tombol analisis kembali beberapa saat lagi.',
          );
        } else {
          setStatus(
            detail || `Status job: ${pollJson.status ?? 'unknown'}`,
          );
        }
      }
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat analisis.',
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleRunDualQuotaVto() {
    if (!selectedTopId && !selectedBottomId) return;
    if (vtoRunning) return;
    if (!vtoQuota.canTryTop && !vtoQuota.canTryBottom) return;

    setVtoRunning(true);
    setVtoWarning(null);
    setVtoStepMessage(
      'Sedang memproses simulasi Virtual Try-On AI via FASHN. Mohon tunggu, proses memakan waktu ~15-30 detik...',
    );

    try {
      const activeToken =
        purchasedToken?.tokenId ||
        initialAnalysisComplete?.tokenId ||
        activeTokenSecret ||
        'demo-token';
      const tokenSecretForAuth =
        purchasedToken?.tokenSecret ?? activeTokenSecret;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (tokenSecretForAuth) {
        headers.authorization = `Bearer ${tokenSecretForAuth}`;
      }

      const baseUserPhoto =
        vtoOutputUri ||
        uploadedBodyPhotoPath ||
        initialAnalysisComplete?.userPhotoUri ||
        photos.fullBody?.previewUrl ||
        'full-body/demo-photo';

      const res = await fetch('/api/virtual-try-on', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          top_product_id: selectedTopId,
          bottom_product_id: selectedBottomId,
          user_photo_uri: baseUserPhoto,
          token_id: activeToken,
        }),
      });
      const data = (await res.json()) as {
        result_image_uri?: string | null;
        quota?: { canTryTop: boolean; canTryBottom: boolean };
        warning_message?: string | null;
        error_message?: string | null;
        message?: string | null;
      };

      const newQuota = data.quota ?? {
        canTryTop: selectedTopId ? false : vtoQuota.canTryTop,
        canTryBottom: selectedBottomId ? false : vtoQuota.canTryBottom,
      };

      setVtoQuota(newQuota);

      if (data.result_image_uri) {
        setVtoOutputUri(data.result_image_uri);
        setSelectedTopId(null);
        setSelectedBottomId(null);

        if (!newQuota.canTryTop && !newQuota.canTryBottom) {
          try {
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(
                `flicks_vto_${activeToken}`,
                data.result_image_uri,
              );
            }
          } catch {
            // Ignore storage errors
          }
        }
      }
      if (data.warning_message) {
        setVtoWarning(data.warning_message);
      } else if (!res.ok || data.error_message || data.message) {
        setVtoWarning(
          data.error_message ||
            data.message ||
            'Gagal memproses Virtual Try-On. Silakan coba kembali.',
        );
      }
    } finally {
      setVtoRunning(false);
      setVtoStepMessage(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>FLICKS LITE · PHOTO INTAKE</p>
        <h1>Mulai dengan fotomu</h1>
        <p className={styles.intro}>
          {requirePurchasedToken
            ? 'Pilih satu foto wajah dan satu foto seluruh tubuh untuk menjalankan analisis Personal Color, Body Shape, dan Virtual Try-On.'
            : 'Pilih satu foto wajah dan satu foto seluruh tubuh untuk melihat demo proses intake.'}
        </p>
      </header>
      {requirePurchasedToken ? (
        isCheckoutLocked ? (
          <p className={styles.lockNotice} role="note">
            Token analisis belum aktif. Selesaikan pembayaran Rp19.000 via QRIS
            / GoPay di atas untuk mengaktifkan token unggah foto dan analisis AI.
          </p>
        ) : (
          <p className={styles.unlockedNotice} role="status">
            Token analisis aktif ({purchasedToken?.tokenId}). Silakan unggah foto
            wajah dan seluruh tubuh Anda di bawah ini.
          </p>
        )
      ) : (
        <p className={styles.notice}>
          Demo lokal: foto tidak dikirim ke server dan tidak disimpan.
        </p>
      )}
      <section className={styles.slots} aria-label="Foto untuk demo">
        {(['face', 'fullBody'] as const).map((kind) => {
          const photo = photos[kind];
          const title = kind === 'face' ? 'Foto wajah' : 'Foto seluruh tubuh';
          const inputId = `photo-${kind}`;
          return (
            <article className={styles.slot} key={kind}>
              <h2>{title}</h2>
              <p>
                {kind === 'face'
                  ? 'Wajah terlihat jelas dan tidak tertutup.'
                  : 'Tubuh terlihat utuh dari kepala hingga kaki.'}
              </p>
              {photo ? (
                <div className={styles.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={`Preview ${title}`} />
                  <p>{photo.file.name}</p>
                  <p>
                    {photo.width} × {photo.height} px
                  </p>
                  <div className={styles.actions}>
                    <label className={styles.secondaryAction} htmlFor={inputId}>
                      Ganti foto
                    </label>
                    <button
                      className={styles.secondaryAction}
                      onClick={() => removePhoto(kind)}
                      type="button"
                    >
                      Hapus {title.toLowerCase()}
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  aria-disabled={isCheckoutLocked ? 'true' : undefined}
                  className={`${styles.dropzone} ${isCheckoutLocked ? styles.dropzoneDisabled : ''}`}
                  htmlFor={inputId}
                >
                  <span aria-hidden="true">＋</span>
                  <span>
                    {isCheckoutLocked
                      ? 'Selesaikan pembayaran untuk unggah foto'
                      : 'Pilih foto'}
                  </span>
                  <span>JPEG, PNG, atau WebP · maksimal 10 MB</span>
                </label>
              )}
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-label={title}
                className={styles.fileInput}
                disabled={isCheckoutLocked}
                id={inputId}
                onChange={(event) => void handleFileChange(kind, event)}
                type="file"
              />
              {errors[kind] && (
                <p className={styles.error} role="alert">
                  {errors[kind]}
                </p>
              )}
            </article>
          );
        })}
      </section>
      {!requirePurchasedToken && (
        <button
          className={styles.submit}
          disabled={!ready}
          onClick={simulateUpload}
          type="button"
        >
          Simulasikan upload
        </button>
      )}
      <fieldset className={styles.genderFieldset}>
        <legend className={styles.genderLegend}>
          Pilih Profil Analisis Body Shape
        </legend>
        <div className={styles.genderRadioGroup}>
          <label
            className={`${styles.genderOption} ${gender === 'male' ? styles.genderSelected : ''} ${isCheckoutLocked ? styles.genderOptionDisabled : ''}`}
          >
            <input
              checked={gender === 'male'}
              disabled={isCheckoutLocked}
              name="gender"
              onChange={() => setGender('male')}
              type="radio"
              value="male"
            />
            <span className={styles.genderIcon} aria-hidden="true">
              👔
            </span>
            <span>Pria (Menswear)</span>
          </label>
          <label
            className={`${styles.genderOption} ${gender === 'female' ? styles.genderSelected : ''} ${isCheckoutLocked ? styles.genderOptionDisabled : ''}`}
          >
            <input
              checked={gender === 'female'}
              disabled={isCheckoutLocked}
              name="gender"
              onChange={() => setGender('female')}
              type="radio"
              value="female"
            />
            <span className={styles.genderIcon} aria-hidden="true">
              👗
            </span>
            <span>Wanita (Womenswear)</span>
          </label>
        </div>
      </fieldset>
      <div
        className={requirePurchasedToken ? styles.liveActionWrap : undefined}
        style={requirePurchasedToken ? undefined : { marginTop: '1rem' }}
      >
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          <input
            checked={consent}
            disabled={isCheckoutLocked}
            onChange={(event) => setConsent(event.currentTarget.checked)}
            type="checkbox"
          />{' '}
          Saya menyetujui pemrosesan foto untuk Analisis AI sesuai Kebijakan
          Privasi
        </label>
        <button
          className={requirePurchasedToken ? styles.submit : styles.secondaryAction}
          disabled={isCheckoutLocked || !ready || !consent || !gender || analyzing}
          onClick={() => void runLiveGeminiAnalysis()}
          type="button"
        >
          {analyzing
            ? 'Memproses dengan Gemini...'
            : requirePurchasedToken
              ? 'Analisis dengan Gemini AI'
              : 'Analisis dengan Gemini AI (Mode Dev)'}
        </button>
      </div>
      <p aria-live="polite" className={styles.status} role="status">
        {status}
      </p>
      {analysisResult && (
        <section
          aria-label="Hasil Analisis AI"
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            border: '1px solid #d4d4d8',
            borderRadius: '0.75rem',
          }}
        >
          <h2>Hasil Analisis AI ({analysisResult.jobStatus})</h2>
          <article style={{ marginTop: '0.75rem' }}>
            <h3>1. Personal Color</h3>
            <p>
              <strong>Musim Utama:</strong>{' '}
              {analysisResult.personal_color.primary_season}
              {analysisResult.personal_color.sub_season
                ? ` (${analysisResult.personal_color.sub_season})`
                : ''}
            </p>
            <p>
              <strong>Tingkat Keyakinan:</strong>{' '}
              {analysisResult.personal_color.confidence_level}
            </p>
            <p>
              <strong>Rekomendasi Warna:</strong>{' '}
              {analysisResult.personal_color.recommended_colors.join(', ')}
            </p>
          </article>
          <article style={{ marginTop: '0.75rem' }}>
            <h3>2. Body Shape &amp; Siluet</h3>
            <p>
              <strong>Estimasi Kategori:</strong>{' '}
              {BODY_SHAPE_LABELS[
                analysisResult.body_shape.category as BodyShapeCategory
              ]?.display ?? analysisResult.body_shape.category}
            </p>
            <p>
              <strong>Tingkat Keyakinan:</strong>{' '}
              {analysisResult.body_shape.confidence_level}
            </p>
            <ul>
              {analysisResult.body_shape.styling_guidance.map((tip, idx) => (
                <li key={idx}>{tip}</li>
              ))}
            </ul>
          </article>
        </section>
      )}
      {recommendations && (
        <section
          className={styles.recommendationBox}
          aria-label="Rekomendasi Produk & Virtual Try-On"
        >
          <div className={styles.recommendationHeader}>
            <h3>Rekomendasi Produk Sesuai Analisis AI Anda</h3>
            <div className={styles.quotaBadges}>
              <span
                className={
                  vtoQuota.canTryTop
                    ? styles.quotaBadgeActive
                    : styles.quotaBadgeUsed
                }
              >
                Kuota Atasan: {vtoQuota.canTryTop ? '1/1 Tersedia' : '0/1 Terpakai'}
              </span>
              <span
                className={
                  vtoQuota.canTryBottom
                    ? styles.quotaBadgeActive
                    : styles.quotaBadgeUsed
                }
              >
                Kuota Bawahan:{' '}
                {vtoQuota.canTryBottom ? '1/1 Tersedia' : '0/1 Terpakai'}
              </span>
            </div>
          </div>

          <div className={styles.categoryGroup}>
            <h4>Atasan (Tops)</h4>
            <div className={styles.productGrid}>
              {recommendations.tops.map((item) => {
                const isSelected = selectedTopId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`${styles.productCard} ${isSelected ? styles.productCardSelected : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className={styles.productThumb}
                    />
                    <h5>{item.name}</h5>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.productStoreLink}
                      >
                        Lihat di Toko ↗
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={!vtoQuota.canTryTop || vtoRunning}
                      aria-label={`Pilih Atasan: ${item.name}`}
                      onClick={() => {
                        setSelectedTopId(isSelected ? null : item.id);
                      }}
                      className={styles.selectProductBtn}
                    >
                      {isSelected
                        ? 'Terpilih ✓'
                        : !vtoQuota.canTryTop
                          ? 'Kuota Habis (0/1)'
                          : 'Pilih Atasan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.categoryGroup}>
            <h4>Bawahan (Bottoms)</h4>
            <div className={styles.productGrid}>
              {recommendations.bottoms.map((item) => {
                const isSelected = selectedBottomId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`${styles.productCard} ${isSelected ? styles.productCardSelected : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className={styles.productThumb}
                    />
                    <h5>{item.name}</h5>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.productStoreLink}
                      >
                        Lihat di Toko ↗
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={!vtoQuota.canTryBottom || vtoRunning}
                      aria-label={`Pilih Bawahan: ${item.name}`}
                      onClick={() => {
                        setSelectedBottomId(isSelected ? null : item.id);
                      }}
                      className={styles.selectProductBtn}
                    >
                      {isSelected
                        ? 'Terpilih ✓'
                        : !vtoQuota.canTryBottom
                          ? 'Kuota Habis (0/1)'
                          : 'Pilih Bawahan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {vtoStepMessage && (
            <p className={styles.vtoStepBanner}>{vtoStepMessage}</p>
          )}
          {vtoWarning && <p className={styles.vtoWarningBanner}>{vtoWarning}</p>}

          <div className={styles.vtoActionRow}>
            {!vtoQuota.canTryTop && !vtoQuota.canTryBottom ? (
              <div className={styles.upsellBanner}>
                <p>Kuota Virtual Try-On sesi ini telah habis (0/1 Atasan, 0/1 Bawahan).</p>
                <button
                  type="button"
                  disabled={true}
                  className={styles.tryOnCtaBtn}
                  style={{ opacity: 0.6, cursor: 'not-allowed', marginBottom: '0.75rem' }}
                >
                  VIRTUAL TRY-ON SELESAI (KUOTA HABIS) ✓
                </button>
                <a
                  href={requirePurchasedToken ? '#checkout-section' : '/checkout'}
                  className={styles.upsellBtn}
                >
                  Tambah Kuota Try-On
                </a>
              </div>
            ) : (
              <button
                type="button"
                disabled={(!selectedTopId && !selectedBottomId) || vtoRunning}
                onClick={() => void handleRunDualQuotaVto()}
                className={styles.tryOnCtaBtn}
              >
                {vtoRunning
                  ? '⏳ MEMPROSES SIMULASI TRY-ON... (MOHON TUNGGU)'
                  : selectedTopId && selectedBottomId
                    ? 'COBA VIRTUAL TRY-ON 1 SETELAN (ATASAN & BAWAHAN)'
                    : selectedTopId
                      ? 'COBA VIRTUAL TRY-ON (ATASAN)'
                      : selectedBottomId
                        ? 'COBA VIRTUAL TRY-ON (BAWAHAN)'
                        : 'COBA VIRTUAL TRY-ON SEKARANG'}
              </button>
            )}
          </div>

          {vtoOutputUri && (
            <div className={styles.vtoResultPreview}>
              <h4>Hasil Virtual Try-On Outfit Anda</h4>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vtoOutputUri}
                alt="Hasil Virtual Try-On"
                className={styles.vtoResultImg}
              />
            </div>
          )}
        </section>
      )}
      <p className={styles.policy}>
        Format JPEG/PNG/WebP · Maksimal 10 MB · Dimensi 512–4096 px ·{' '}
        <a href="/privacy">Kebijakan Privasi</a>
      </p>
    </main>
  );
}

export default PhotoIntakeForm;
