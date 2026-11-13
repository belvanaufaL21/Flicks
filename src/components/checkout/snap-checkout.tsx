'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './snap-checkout.module.css';

const SNAP_SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
const SNAP_PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 60000;
const DEFAULT_SCRIPT_TIMEOUT_MS = 10000;

export interface MidtransSnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

export interface MidtransSnapInstance {
  pay: (snapToken: string, callbacks?: MidtransSnapCallbacks) => void;
}

declare global {
  interface Window {
    snap?: MidtransSnapInstance;
  }
}

export interface SnapSuccessPayload {
  paymentId: string;
  providerReference: string;
  tokenId: string;
  tokenSecret: string;
}

export interface SnapCheckoutProps {
  clientKey?: string;
  isProduction?: boolean;
  onSuccess: (payload: SnapSuccessPayload) => void;
  disabled?: boolean;
  pollingIntervalMs?: number;
  pollingTimeoutMs?: number;
  scriptLoadTimeoutMs?: number;
}

interface ActiveOrder {
  paymentId: string;
  providerReference: string;
  snapToken: string;
  redirectUrl: string;
}

type CheckoutPhase =
  | 'idle'
  | 'creating'
  | 'modal_open'
  | 'pending'
  | 'verifying'
  | 'blocked'
  | 'paid'
  | 'error';

interface CheckoutApiResponse {
  payment_id?: string;
  provider_reference?: string;
  snap_token?: string;
  redirect_url?: string;
  qris_url?: string;
  message?: string;
}

interface PaymentPollResponse {
  payment_id?: string;
  provider_reference?: string;
  status?: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  token_id?: string | null;
  token_secret?: string | null;
  message?: string;
}

function getSnapScriptUrl(isProduction: boolean): string {
  return isProduction ? SNAP_PRODUCTION_URL : SNAP_SANDBOX_URL;
}

function extractResumedOrder(search: string): ActiveOrder | null {
  const orderId = new URLSearchParams(search).get('order_id')?.trim() ?? '';
  if (!/^flicks-[A-Za-z0-9-]+$/.test(orderId)) return null;
  return {
    paymentId: orderId.slice('flicks-'.length),
    providerReference: orderId,
    snapToken: '',
    redirectUrl: '',
  };
}

export function SnapCheckout({
  clientKey,
  isProduction,
  onSuccess,
  disabled = false,
  pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollingTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  scriptLoadTimeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS,
}: SnapCheckoutProps) {
  const resolvedClientKey = (
    clientKey ||
    process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ||
    ''
  ).trim();

  const resolvedIsProduction =
    isProduction ??
    (process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION !== undefined
      ? process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
      : resolvedClientKey.startsWith('Mid-'));

  const [initialResumedOrder] = useState<ActiveOrder | null>(() =>
    typeof window !== 'undefined'
      ? extractResumedOrder(window.location.search)
      : null,
  );
  const [phase, setPhase] = useState<CheckoutPhase>(() =>
    initialResumedOrder ? 'verifying' : 'idle',
  );
  const [statusMessage, setStatusMessage] = useState<string>(() =>
    initialResumedOrder
      ? 'Memverifikasi status pembayaran dan menyiapkan token analisis...'
      : '',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(
    () => initialResumedOrder,
  );

  const mountedRef = useRef(true);
  const deliveredRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePollRef = useRef<symbol | null>(null);
  const scriptStateRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const scriptWaitersRef = useRef<
    Array<{ resolve: (snap: MidtransSnapInstance) => void; reject: (err: Error) => void }>
  >([]);

  const stopPolling = useCallback(() => {
    activePollRef.current = null;
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current !== null) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (typeof document === 'undefined' || !resolvedClientKey) return;
    if (window.snap?.pay) {
      scriptStateRef.current = 'ready';
      return;
    }

    const expectedSrc = getSnapScriptUrl(resolvedIsProduction);
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-midtrans-snap="true"]',
    );

    let targetScript: HTMLScriptElement;
    const reuseExisting =
      existing !== null &&
      existing.getAttribute('src') === expectedSrc &&
      existing.getAttribute('data-client-key') === resolvedClientKey;

    if (reuseExisting) {
      targetScript = existing;
      if (targetScript.dataset.snapState === 'error') {
        scriptStateRef.current = 'error';
        return;
      }
      if (targetScript.dataset.snapState === 'ready') {
        scriptStateRef.current = 'ready';
        return;
      }
    } else {
      if (existing) {
        existing.remove();
      }
      targetScript = document.createElement('script');
      targetScript.src = expectedSrc;
      targetScript.async = true;
      targetScript.setAttribute('data-midtrans-snap', 'true');
      targetScript.setAttribute('data-client-key', resolvedClientKey);
      targetScript.dataset.snapState = 'loading';
      document.head.appendChild(targetScript);
    }

    scriptStateRef.current = 'loading';

    const handleLoad = () => {
      targetScript.dataset.snapState = 'ready';
      scriptStateRef.current = 'ready';
      const snapInstance = window.snap;
      const waiters = scriptWaitersRef.current.splice(0);
      for (const waiter of waiters) {
        if (snapInstance?.pay) {
          waiter.resolve(snapInstance);
        } else {
          waiter.reject(
            new Error(
              'Script Midtrans Snap termuat tetapi window.snap tidak tersedia. Periksa pemblokir iklan browser Anda.',
            ),
          );
        }
      }
    };

    const handleError = () => {
      targetScript.dataset.snapState = 'error';
      scriptStateRef.current = 'error';
      const waiters = scriptWaitersRef.current.splice(0);
      const err = new Error(
        'Gagal memuat popup Midtrans (kemungkinan diblokir ad-blocker). Gunakan tautan pembayaran langsung di bawah.',
      );
      for (const waiter of waiters) {
        waiter.reject(err);
      }
    };

    targetScript.addEventListener('load', handleLoad);
    targetScript.addEventListener('error', handleError);

    return () => {
      targetScript.removeEventListener('load', handleLoad);
      targetScript.removeEventListener('error', handleError);
    };
  }, [resolvedClientKey, resolvedIsProduction]);

  const ensureSnapReady = useCallback((): Promise<MidtransSnapInstance> => {
    if (typeof window !== 'undefined' && window.snap?.pay) {
      scriptStateRef.current = 'ready';
      return Promise.resolve(window.snap);
    }

    if (!resolvedClientKey) {
      return Promise.reject(
        new Error('Client key Midtrans belum tersedia. Gunakan tautan pembayaran langsung.'),
      );
    }

    if (scriptStateRef.current === 'error') {
      return Promise.reject(
        new Error(
          'Popup Midtrans tidak dapat dimuat (kemungkinan diblokir ad-blocker). Silakan nonaktifkan pemblokir iklan atau gunakan tautan pembayaran langsung.',
        ),
      );
    }

    return new Promise<MidtransSnapInstance>((resolve, reject) => {
      const timer = setTimeout(() => {
        scriptWaitersRef.current = scriptWaitersRef.current.filter(
          (w) => w.resolve !== wrappedResolve,
        );
        reject(
          new Error(
            'Waktu muat popup Midtrans habis (kemungkinan diblokir ad-blocker). Gunakan tautan pembayaran langsung di bawah.',
          ),
        );
      }, scriptLoadTimeoutMs);

      const wrappedResolve = (snap: MidtransSnapInstance) => {
        clearTimeout(timer);
        resolve(snap);
      };

      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      scriptWaitersRef.current.push({
        resolve: wrappedResolve,
        reject: wrappedReject,
      });
    });
  }, [resolvedClientKey, scriptLoadTimeoutMs]);

  const pollPaymentStatus = useCallback(
    async (order: ActiveOrder) => {
      if (
        !mountedRef.current ||
        deliveredRef.current ||
        activePollRef.current !== null
      ) {
        return;
      }

      const pollToken = Symbol('poll');
      activePollRef.current = pollToken;
      try {
        const res = await fetch(
          `/api/payments/${encodeURIComponent(order.paymentId)}`,
        );
        if (
          !mountedRef.current ||
          deliveredRef.current ||
          activePollRef.current !== pollToken
        ) {
          return;
        }

        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setPhase('error');
            setErrorMessage('Data transaksi pembayaran tidak ditemukan.');
          }
          return;
        }

        const data = (await res.json()) as PaymentPollResponse;
        if (
          !mountedRef.current ||
          deliveredRef.current ||
          activePollRef.current !== pollToken
        ) {
          return;
        }

        if (data.status === 'paid') {
          stopPolling();
          if (data.token_id && data.token_secret) {
            deliveredRef.current = true;
            setErrorMessage(null);
            setPhase('paid');
            setStatusMessage('Pembayaran berhasil! Token analisis siap digunakan.');
            onSuccess({
              paymentId: order.paymentId,
              providerReference:
                data.provider_reference || order.providerReference,
              tokenId: data.token_id,
              tokenSecret: data.token_secret,
            });
          } else {
            setPhase('error');
            setErrorMessage(
              'Pembayaran lunas, tetapi token tidak tersedia atau sudah digunakan.',
            );
          }
          return;
        }

        if (
          data.status === 'failed' ||
          data.status === 'expired' ||
          data.status === 'refunded'
        ) {
          stopPolling();
          setActiveOrder(null);
          setPhase('error');
          setStatusMessage('');
          setErrorMessage(
            'Pembayaran kedaluwarsa atau gagal. Silakan buat transaksi baru.',
          );
        }
      } catch {
        // Keep polling on transient network drops until 60s timeout
      } finally {
        if (activePollRef.current === pollToken) {
          activePollRef.current = null;
        }
      }
    },
    [onSuccess, stopPolling],
  );

  const startPolling = useCallback(
    (order: ActiveOrder) => {
      if (deliveredRef.current) return;
      stopPolling();

      void pollPaymentStatus(order);

      pollIntervalRef.current = setInterval(() => {
        void pollPaymentStatus(order);
      }, pollingIntervalMs);

      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        if (!mountedRef.current || deliveredRef.current) return;
        setPhase((prev) => (prev === 'paid' || prev === 'error' ? prev : 'pending'));
        setStatusMessage(
          'Konfirmasi pembayaran belum diterima dalam 60 detik. Klik "Cek Status Pembayaran" jika saldo sudah terpotong.',
        );
      }, pollingTimeoutMs);
    },
    [pollPaymentStatus, pollingIntervalMs, pollingTimeoutMs, stopPolling],
  );

  useEffect(() => {
    if (!initialResumedOrder || deliveredRef.current) return;
    startPolling(initialResumedOrder);

    return () => {
      stopPolling();
    };
  }, [initialResumedOrder, startPolling, stopPolling]);

  const openSnapModal = useCallback(
    (snap: MidtransSnapInstance, order: ActiveOrder) => {
      setErrorMessage(null);
      setPhase('modal_open');
      setStatusMessage(
        'Silakan scan QRIS atau selesaikan pembayaran GoPay di popup Midtrans.',
      );

      snap.pay(order.snapToken, {
        onSuccess: () => {
          if (!mountedRef.current || deliveredRef.current) return;
          setErrorMessage(null);
          setPhase('verifying');
          setStatusMessage(
            'Pembayaran diterima. Memverifikasi status dan menyiapkan token analisis...',
          );
          startPolling(order);
        },
        onPending: () => {
          if (!mountedRef.current || deliveredRef.current) return;
          setErrorMessage(null);
          setPhase('pending');
          setStatusMessage(
            'Pembayaran menunggu penyelesaian. Sistem memeriksa status otomatis setiap 2 detik.',
          );
          startPolling(order);
        },
        onError: () => {
          if (!mountedRef.current || deliveredRef.current) return;
          stopPolling();
          setPhase('error');
          setStatusMessage('');
          setErrorMessage(
            'Pembayaran gagal diproses oleh Midtrans. Silakan coba lagi.',
          );
        },
        onClose: () => {
          if (!mountedRef.current || deliveredRef.current) return;
          setPhase((prev) =>
            prev === 'paid' || prev === 'error' || prev === 'verifying'
              ? prev
              : 'pending',
          );
          setStatusMessage(
            'Popup pembayaran ditutup. Jika Anda sudah membayar, sistem tetap memeriksa status otomatis.',
          );
          startPolling(order);
        },
      });
    },
    [startPolling, stopPolling],
  );

  async function handleStartCheckout() {
    if (disabled || phase === 'creating') return;

    stopPolling();
    deliveredRef.current = false;
    setActiveOrder(null);
    setErrorMessage(null);
    setPhase('creating');
    setStatusMessage('Membuat transaksi pembayaran QRIS / GoPay...');

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_code: 'flicks-lite-pack' }),
      });
      const body = (await res.json()) as CheckoutApiResponse;

      if (!res.ok || !body.payment_id || !body.snap_token) {
        setPhase('error');
        setStatusMessage('');
        setErrorMessage(
          body.message || 'Gagal memulai transaksi checkout Midtrans.',
        );
        return;
      }

      const order: ActiveOrder = {
        paymentId: body.payment_id,
        providerReference: body.provider_reference ?? '',
        snapToken: body.snap_token,
        redirectUrl: body.redirect_url ?? body.qris_url ?? '',
      };
      setActiveOrder(order);

      try {
        const snap = await ensureSnapReady();
        if (!mountedRef.current) return;
        openSnapModal(snap, order);
      } catch (snapErr) {
        if (!mountedRef.current) return;
        setPhase('blocked');
        setStatusMessage(
          'Jika popup tidak muncul, gunakan tautan pembayaran langsung lalu cek status di sini.',
        );
        setErrorMessage(
          snapErr instanceof Error
            ? snapErr.message
            : 'Popup pembayaran Midtrans gagal dimuat.',
        );
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setPhase('error');
      setStatusMessage('');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan jaringan saat membuat pembayaran.',
      );
    }
  }

  function handleReopenModal() {
    if (!activeOrder) return;
    setErrorMessage(null);
    if (typeof window !== 'undefined' && window.snap?.pay) {
      openSnapModal(window.snap, activeOrder);
      return;
    }
    void ensureSnapReady()
      .then((snap) => {
        if (!mountedRef.current) return;
        openSnapModal(snap, activeOrder);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setPhase('blocked');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Popup Midtrans diblokir. Gunakan tautan pembayaran langsung.',
        );
      });
  }

  const isCreating = phase === 'creating';
  const showPrimaryButton =
    phase === 'idle' ||
    phase === 'creating' ||
    phase === 'error' ||
    phase === 'paid';
  const showActiveControls =
    activeOrder !== null &&
    (phase === 'pending' ||
      phase === 'verifying' ||
      phase === 'blocked' ||
      phase === 'error');

  return (
    <section className={styles.card} aria-label="Pembayaran Token Analisis">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PAKET ANALISIS AI · FLICKS LITE</p>
          <h2 className={styles.title}>Buka Analisis &amp; Virtual Try-On</h2>
          <p className={styles.subtitle}>
            Sekali bayar untuk paket analisis warna personal, bentuk tubuh, dan
            kuota coba pakaian atasan serta bawahan.
          </p>
        </div>
        <div className={styles.priceBox}>
          <span className={styles.priceLabel}>Total Bayar</span>
          <span className={styles.priceValue}>Rp19.000</span>
        </div>
      </div>

      <div className={styles.badgesRow} aria-label="Metode pembayaran didukung">
        <span className={styles.badgesCaption}>Metode Instan:</span>
        <span className={styles.badge}>
          <span className={styles.badgeDotQris} aria-hidden="true" />
          QRIS
        </span>
        <span className={styles.badge}>
          <span className={styles.badgeDotGopay} aria-hidden="true" />
          GoPay
        </span>
      </div>

      {showPrimaryButton && (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={disabled || isCreating}
          onClick={() => void handleStartCheckout()}
        >
          {isCreating
            ? 'Memproses Checkout...'
            : phase === 'paid'
              ? 'Beli Token Baru — Rp19.000'
              : 'Beli Token Analisis — Rp19.000'}
        </button>
      )}

      {statusMessage && (
        <div className={styles.statusPanel} role="status" aria-live="polite">
          <p className={styles.statusText}>{statusMessage}</p>
          {showActiveControls && (
            <div className={styles.actionRow}>
              {phase !== 'blocked' && activeOrder.snapToken && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleReopenModal}
                >
                  Buka Kembali Pembayaran
                </button>
              )}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void pollPaymentStatus(activeOrder)}
              >
                Cek Status Pembayaran
              </button>
              {activeOrder.redirectUrl && phase === 'blocked' && (
                <a
                  href={activeOrder.redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fallbackLink}
                  onClick={() => startPolling(activeOrder)}
                >
                  Lanjutkan Pembayaran di Midtrans ↗
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <p className={styles.errorAlert} role="alert">
          {errorMessage}
        </p>
      )}

      {phase === 'paid' && (
        <p className={styles.successBanner}>
          Token analisis aktif dan siap digunakan.
        </p>
      )}
    </section>
  );
}
