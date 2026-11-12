"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, FlaskConical, Loader2, Lock, QrCode } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { rupiah } from "@/lib/labels";
import type { FlowState } from "@/services/session-state.service";
import { PhotoStep, type Photos } from "./photo-step";
import { ScanStep } from "./scan-step";
import { TryOnStep } from "./tryon-step";
import { CenteredSpinner, ErrorBox, Heading, PrimaryButton, api } from "./ui";

type Step = "checkout" | "upload" | "analyzing" | "tryon";

const STEPS: { id: Step; label: string }[] = [
  { id: "checkout", label: "Mulai" },
  { id: "upload", label: "Foto" },
  { id: "analyzing", label: "Analisis" },
  { id: "tryon", label: "Try-On" },
];

// The server decides the step; the page only renders it.
function stepOf(s: FlowState): Step {
  if (!s.payment || s.payment.status !== "paid" || !s.token) return "checkout";
  const a = s.analysis;
  if (!a || a.status === "needs_retake" || a.status === "failed") {
    return s.token.status === "consumed" ? "tryon" : "upload";
  }
  if (a.status === "queued" || a.status === "processing") return "analyzing";
  return "tryon";
}

type FlowResponse = { state: FlowState };

export function AnalyzeFlow() {
  const [state, setState] = useState<FlowState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The visitor's checked, cropped photos. Kept here (not in the upload step) so the
  // scan screen and the try-on stage can show them, and so a failed upload keeps them.
  const [photos, setPhotos] = useState<Photos>({ face: null, body: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // One key per set of photos: sending the same photos twice can never start a second job.
  const keyRef = useRef<{ face: string | null; body: string | null; key: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api<FlowState>("/api/session"));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  // Initial load, scheduled so no state is set during the effect itself.
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const serverStep = state ? stepOf(state) : null;
  // While the photos upload, show the scan screen right away instead of a spinner.
  const step = uploading ? "analyzing" : serverStep;
  const job = state?.tryon;
  const waiting =
    !uploading &&
    (serverStep === "analyzing" ||
      job?.status === "queued" ||
      job?.status === "processing" ||
      (serverStep === "checkout" && state?.payment?.status === "pending"));

  // Each step starts at the top; a short step must not open scrolled past its content.
  useEffect(() => {
    if (step) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Poll only while the server is working on something.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  async function submitPhotos() {
    if (!photos.face || !photos.body || uploading) return;
    const k = keyRef.current;
    if (!k || k.face !== photos.face.url || k.body !== photos.body.url) {
      keyRef.current = { face: photos.face.url, body: photos.body.url, key: crypto.randomUUID() };
    }
    const form = new FormData();
    form.set("face", photos.face.blob, "face.jpg");
    form.set("body", photos.body.blob, "body.jpg");
    form.set("consent", "true");
    form.set("idempotencyKey", keyRef.current!.key);

    setUploadError(null);
    setUploading(true);
    try {
      const res = await api<FlowResponse>("/api/analysis", { method: "POST", body: form });
      setState(res.state);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const analysis = state?.analysis;
  const faceShot = { url: photos.face?.url ?? analysis?.facePhotoUrl ?? null, points: photos.face?.points ?? [] };
  const bodyShot = { url: photos.body?.url ?? analysis?.bodyPhotoUrl ?? null, points: photos.body?.points ?? [] };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      {state && state.demoNotes.length > 0 && (
        <div className="mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft/60 px-4 py-3 text-sm text-accent-deep">
          <FlaskConical size={18} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Mode demo:</span> {state.demoNotes.join("; ")}.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <Stepper current={step} />
      </div>

      <div className="mt-10">
        {!state && !loadError && <CenteredSpinner label="Memuat sesi…" />}
        {loadError && <ErrorBox message={loadError} onRetry={refresh} />}
        <AnimatePresence mode="wait">
          {state && step && (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: easeOut }}
            >
              {step === "checkout" && (
                <div className="mx-auto max-w-3xl">
                  <CheckoutStep state={state} onState={setState} onRefresh={refresh} />
                </div>
              )}
              {step === "upload" && (
                <PhotoStep state={state} photos={photos} onPhotos={setPhotos} onSubmit={submitPhotos} submitError={uploadError} />
              )}
              {step === "analyzing" && <ScanStep face={faceShot} body={bodyShot} uploading={uploading} />}
              {step === "tryon" && <TryOnStep state={state} bodyUrl={bodyShot.url} onState={setState} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step | null }) {
  const index = current ? STEPS.findIndex((s) => s.id === current) : -1;
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Langkah">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.id} className="flex flex-col gap-2" aria-current={active ? "step" : undefined}>
            <span className="h-1 overflow-hidden rounded-full bg-line">
              <motion.span
                className="block h-full bg-accent-deep"
                initial={false}
                animate={{ width: done ? "100%" : active ? "50%" : "0%" }}
                transition={{ duration: 0.6, ease: easeOut }}
              />
            </span>
            <span
              className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs ${
                active ? "text-ink" : done ? "text-accent-deep" : "text-muted/70"
              }`}
            >
              {done && <Check size={12} />}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Step 1 -------------------------------------------------------------------------

function CheckoutStep({
  state,
  onState,
  onRefresh,
}: {
  state: FlowState;
  onState: (s: FlowState) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payment = state.payment;
  const pending = payment?.status === "pending";
  const lapsed = payment && (payment.status === "expired" || payment.status === "failed");
  // Trial mode: the token is issued without payment.
  const free = state.freeCheckout;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<FlowResponse & { paymentUrl: string | null }>("/api/checkout", { method: "POST" });
      // Live payments continue on Midtrans's QRIS page; trial and demo go straight on.
      if (res.paymentUrl) window.location.assign(res.paymentUrl);
      else onState(res.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/checkout/simulate", { method: "POST" });
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = [
    "1× Analisis Personal Color",
    "1× Analisis Body Shape",
    "1× Virtual Try-On",
    "Laporan privat, aktif 72 jam",
  ];

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-start">
      <div>
        {free ? (
          <Heading eyebrow="Langkah 1 · Uji coba gratis" title={<>Coba dulu, <em className="text-accent">gratis</em>.</>}>
            Selama masa uji coba, kamu tidak perlu membayar. Paketnya sama lengkapnya dengan versi berbayar.
          </Heading>
        ) : (
          <Heading eyebrow="Langkah 1 · Pembayaran" title={<>Satu token, <em className="text-accent">satu paket lengkap</em>.</>}>
            Bayar sekali dengan QRIS. Token diterbitkan setelah pembayaran terverifikasi oleh server, bukan oleh
            browser.
          </Heading>
        )}
        <ul className="mt-8 space-y-3">
          {items.map((t) => (
            <li key={t} className="flex items-center gap-3 text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper">
                <Check size={13} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-8 flex items-center gap-2 text-xs text-muted">
          <Lock size={13} /> Tanpa akun · tanpa langganan · hasil AI bersifat estimasi
        </p>
      </div>

      <div className="rounded-[2rem] border border-line bg-paper p-6 shadow-[0_24px_48px_-32px_rgba(37,34,31,0.45)] sm:p-8">
        <div className="flex items-center justify-between text-sm text-muted">
          <span className="font-display text-xl text-ink">FLICKS Lite</span>
          <span className="flex items-center gap-1.5">
            {free ? (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-deep">Uji coba</span>
            ) : (
              <>
                <QrCode size={15} /> QRIS
              </>
            )}
          </span>
        </div>
        <div className="my-5 border-t border-dashed border-line" />
        <div className="space-y-2 font-mono text-xs text-muted">
          <div className="flex justify-between">
            <span>1× Token FLICKS</span>
            <span className={free ? "text-muted line-through" : "text-ink"}>{rupiah(state.priceIdr)}</span>
          </div>
          {free ? (
            <div className="flex justify-between">
              <span>Gratis selama uji coba</span>
              <span className="text-ink">−{rupiah(state.priceIdr)}</span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span>Biaya tersembunyi</span>
              <span className="text-ink">Rp0</span>
            </div>
          )}
        </div>
        <div className="my-5 border-t border-dashed border-line" />
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Total</span>
          <span className="font-display text-4xl text-ink">{free ? "Rp0" : rupiah(state.priceIdr)}</span>
        </div>

        {pending ? (
          <div className="mt-6 text-center">
            {payment.simulated ? (
              <QrBox />
            ) : (
              payment.paymentUrl && (
                <a
                  href={payment.paymentUrl}
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-paper transition-colors hover:bg-accent-deep"
                >
                  <QrCode size={16} /> Buka halaman pembayaran QRIS
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </a>
              )
            )}
            {!payment.simulated && (
              <p className="mt-3 text-xs text-muted">
                Kode QRIS ditampilkan di halaman Midtrans. Setelah membayar, kamu otomatis kembali ke sini.
              </p>
            )}
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Menunggu pembayaran…
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted/80">{payment.orderId}</p>
            {payment.simulated && (
              <button
                onClick={simulate}
                disabled={busy}
                className="mt-5 w-full rounded-full border border-accent px-5 py-3 text-sm font-medium text-accent-deep hover:bg-accent-soft disabled:opacity-50"
              >
                Simulasikan pembayaran berhasil (demo)
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {lapsed && (
              <p className="mb-3 text-sm text-red-900">
                Transaksi sebelumnya {payment.status === "expired" ? "kedaluwarsa" : "gagal"}. Buat QR baru untuk mencoba lagi.
              </p>
            )}
            <PrimaryButton className="w-full" busy={busy} disabled={!state.paidFeaturesEnabled} onClick={start}>
              {busy ? (free ? "Menyiapkan…" : "Membuka pembayaran…") : free ? "Mulai gratis" : `Bayar ${rupiah(state.priceIdr)} dengan QRIS`}{" "}
              {!busy && <ArrowRight size={16} />}
            </PrimaryButton>
            {!state.paidFeaturesEnabled && (
              <p className="mt-3 text-sm text-red-900">Pembelian sedang tidak tersedia. Coba lagi nanti.</p>
            )}
          </div>
        )}
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </div>
    </div>
  );
}

function QrBox() {
  // Demo placeholder: a decorative pattern, deliberately not a scannable code.
  const cells = Array.from({ length: 21 * 21 }, (_, i) => ((Math.imul(i + 1, 2654435761) >>> 0) >>> 28) % 3 === 0);
  return (
    <div className="relative mx-auto h-56 w-56 rounded-xl bg-white p-3">
      <div className="grid h-full w-full grid-cols-[repeat(21,1fr)] opacity-25">
        {cells.map((on, i) => (
          <span key={i} className={on ? "bg-ink" : ""} />
        ))}
      </div>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-accent-deep shadow">QR demo</span>
      </span>
    </div>
  );
}
