'use client';

import React, { useEffect, useState } from 'react';
import {
  BODY_SHAPE_LABELS,
  type BodyShapeCategory,
} from '@/shared/body-shape-labels';
import styles from './report-view.module.css';

export interface CustomerReportViewData {
  reportId?: string;
  isExpired?: boolean;
  expiresAt?: string;
  remainingSeconds: number;
  analysisStatus?: string;
  personalColor: {
    primarySeason: string | null;
    subSeason?: string | null;
    confidenceLevel: string | null;
    paletteRecommendations: {
      clothing: string[];
      avoid?: string[];
    };
    uncertaintyNotes?: string[];
    disclaimer: string;
  } | null;
  bodyShape: {
    category: string | null;
    gender?: string | null;
    confidenceLevel: string | null;
    stylingTips: string[];
    uncertaintyNotes?: string[];
    disclaimer: string;
  } | null;
  virtualTryOn: {
    status?: string;
    product: {
      id?: string;
      name: string;
      category?: string;
    } | null;
    resultAssetUrl: string | null;
  } | null;
  recommendations?: {
    tops: Array<{
      id: string;
      name: string;
      brand?: string | null;
      category: string;
      imagePath: string;
      sourceUrl?: string | null;
      matchReasons?: string[];
    }>;
    bottoms: Array<{
      id: string;
      name: string;
      brand?: string | null;
      category: string;
      imagePath: string;
      sourceUrl?: string | null;
      matchReasons?: string[];
    }>;
  } | null;
  metadata: {
    disclaimer: string;
  };
}

export interface ReportViewProps {
  secret?: string;
  initialReport?: CustomerReportViewData | null;
}

function formatRemainingHours(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours} jam ${minutes} menit`;
}

export function ReportView({
  secret: propSecret,
  initialReport,
}: ReportViewProps) {
  const resolvedSecret = propSecret ?? '';
  const [report, setReport] = useState<CustomerReportViewData | null>(
    initialReport ?? null,
  );
  const [loading, setLoading] = useState<boolean>(!initialReport);

  useEffect(() => {
    if (initialReport || !resolvedSecret) return;

    let cancelled = false;
    async function loadReport() {
      try {
        const res = await fetch(
          `/api/report/${encodeURIComponent(resolvedSecret)}`,
        );
        if (cancelled) return;
        if (res.status === 410 || res.status === 404) {
          setReport({
            isExpired: true,
            remainingSeconds: 0,
            personalColor: null,
            bodyShape: null,
            virtualTryOn: null,
            metadata: { disclaimer: '' },
          });
        } else if (res.ok) {
          const data = (await res.json()) as CustomerReportViewData;
          setReport({ ...data, isExpired: false });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [initialReport, resolvedSecret]);

  if (loading) {
    return (
      <main className={styles.reportContainer}>
        <p>Memuat laporan privat Anda...</p>
      </main>
    );
  }

  if (
    !report ||
    report.isExpired ||
    (typeof report.remainingSeconds === 'number' &&
      report.remainingSeconds <= 0)
  ) {
    return (
      <main className={styles.reportContainer}>
        <section className={styles.expiredCard}>
          <h1>Laporan Telah Kedaluwarsa</h1>
          <p>
            Masa aktif 72 jam laporan ini telah berakhir dan foto sesi telah
            dijadwalkan untuk dihapus demi menjaga privasi Anda.
          </p>
        </section>
      </main>
    );
  }

  // ponytail:client-print-to-pdf — native browser print over serverless puppeteer; upgrade to @react-pdf/renderer if backend PDF job is needed
  const handleDownloadPdf = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <main className={styles.reportContainer}>
      <div className={`${styles.topBar} ${styles.noPrint}`}>
        <span className={styles.expiryBadge}>
          Sisa masa aktif laporan:{' '}
          <strong>{formatRemainingHours(report.remainingSeconds)}</strong> (Maks.
          72 jam)
        </span>
        <button
          type="button"
          onClick={handleDownloadPdf}
          className={styles.printButton}
        >
          Simpan PDF
        </button>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Laporan Personal Styling FLICKS</h1>
        <p className={styles.subtitle}>
          Ringkasan Personal Color, Body Shape, dan Simulasi Virtual Try-On Anda
        </p>
      </header>

      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>1. Analisis Personal Color</h2>
        {report.personalColor?.primarySeason ? (
          <>
            <p className={styles.highlightValue}>
              {report.personalColor.primarySeason}
            </p>
            {report.personalColor.paletteRecommendations?.clothing?.length ? (
              <div className={styles.swatchRow}>
                {report.personalColor.paletteRecommendations.clothing.map(
                  (hex) => (
                    <span key={hex} className={styles.swatchItem}>
                      <span
                        className={styles.swatchColor}
                        style={{ backgroundColor: hex }}
                      />
                      <code>{hex}</code>
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </>
        ) : (
          <p>
            Hasil belum konklusif.{' '}
            {report.personalColor?.uncertaintyNotes?.join(' ') ??
              'Disarankan mengambil foto ulang dengan pencahayaan alami.'}
          </p>
        )}
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>2. Analisis Body Shape</h2>
        {report.bodyShape?.gender ? (
          <span className={styles.genderBadge}>
            Profil:{' '}
            {report.bodyShape.gender === 'male'
              ? 'Pria (Menswear)'
              : 'Wanita (Womenswear)'}
          </span>
        ) : null}
        {report.bodyShape?.category ? (
          <>
            <p className={styles.highlightValue}>
              {BODY_SHAPE_LABELS[
                report.bodyShape.category.toLowerCase() as BodyShapeCategory
              ]?.display ??
                BODY_SHAPE_LABELS[
                  report.bodyShape.category as BodyShapeCategory
                ]?.display ??
                report.bodyShape.category}
            </p>
            {report.bodyShape.stylingTips?.length ? (
              <ul>
                {report.bodyShape.stylingTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p>
            Proporsi tubuh belum dapat dipastikan secara konklusif.{' '}
            {report.bodyShape?.uncertaintyNotes?.join(' ') ?? ''}
          </p>
        )}
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>3. Simulasi Virtual Try-On</h2>
        {report.virtualTryOn?.product ? (
          <p>
            Produk pilihan: <strong>{report.virtualTryOn.product.name}</strong>
            {report.virtualTryOn.product.category
              ? ` (${report.virtualTryOn.product.category})`
              : ''}
          </p>
        ) : null}
        {report.virtualTryOn?.resultAssetUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={report.virtualTryOn.resultAssetUrl}
            alt={
              report.virtualTryOn.product?.name ?? 'Hasil Simulasi Virtual Try-On'
            }
            className={styles.vtoImage}
          />
        ) : (
          <p>Visual Virtual Try-On belum tersedia untuk sesi ini.</p>
        )}
      </section>

      {report.recommendations &&
        (report.recommendations.tops.length > 0 ||
          report.recommendations.bottoms.length > 0) && (
          <section
            className={`${styles.sectionCard} ${styles.recommendationsSection}`}
          >
            <h2 className={styles.sectionTitle}>
              Rekomendasi Produk &amp; Tautan Toko
            </h2>
            <p className={styles.subtitle} style={{ marginBottom: '1rem' }}>
              Produk di bawah ini dikurasi otomatis berdasarkan kecocokan warna
              kulit dan proporsi tubuh Anda:
            </p>
            <div className={styles.recommendationGrid}>
              {[
                ...report.recommendations.tops,
                ...report.recommendations.bottoms,
              ].map((item) => (
                <div key={item.id} className={styles.recommendationCard}>
                  <span className={styles.recommendationCategoryBadge}>
                    {item.category === 'tops' ? 'Atasan' : 'Bawahan'}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imagePath}
                    alt={item.name}
                    className={styles.recommendationThumb}
                  />
                  <h4>{item.name}</h4>
                  {item.brand && (
                    <p className={styles.recommendationBrand}>{item.brand}</p>
                  )}
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.storeLinkButton}
                    >
                      Beli di Toko ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      <footer className={styles.disclaimerBox}>
        <strong>Catatan & Batasan AI:</strong>{' '}
        {report.metadata?.disclaimer ||
          'Hasil AI adalah panduan kurasi gaya dan bukan diagnosis profesional.'}
      </footer>
    </main>
  );
}
