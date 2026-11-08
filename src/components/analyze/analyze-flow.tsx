"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  FlaskConical,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { rupiah } from "@/lib/labels";
import type { FlowState } from "@/services/session-state.service";
import { PhotoDrop } from "./photo-drop";

type Step = "checkout" | "upload" | "analyzing" | "product" | "tryon" | "done";
type Product = { id: string; name: string; brand: string; subcategory: string; image: string; silhouette: string[] };

const STEPS: { id: Step; label: string }[] = [
  { id: "checkout", label: "Bayar" },
  { id: "upload", label: "Foto" },
  { id: "analyzing", label: "Analisis" },
  { id: "product", label: "Try-On" },
  { id: "done", label: "Laporan" },
];

// The server decides the step; the page only renders it.
function stepOf(s: FlowState): Step {
  if (!s.payment || s.payment.status !== "paid" || !s.token) return "checkout";
  const a = s.analysis;
  if (!a || a.status === "needs_retake" || a.status === "failed") {
    return s.token.status === "consumed" ? "done" : "upload";
  }
  if (a.status === "queued" || a.status === "processing") return "analyzing";
  const t = s.tryon;
  if (!t || t.status === "failed") return "product";
  if (t.status === "queued" || t.status === "processing") return "tryon";
  return "done";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Terjadi kesalahan. Coba lagi.");
  return body as T;
}

export function AnalyzeFlow() {
  const [state, setState] = useState<FlowState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const step = state ? stepOf(state) : null;
  const waiting =
    step === "analyzing" || step === "tryon" || (step === "checkout" && state?.payment?.status === "pending");

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      {state?.demo && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft/60 px-4 py-3 text-sm text-accent-deep">
          <FlaskConical size={18} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Mode demo.</span> Satu atau lebih kunci API belum diatur, jadi pembayaran
            disimulasikan dan hasil AI berupa contoh tetap. Tidak ada uang yang ditarik.
          </p>
        </div>
      )}

      <Stepper current={step} />

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
              transition={{ duration: 0.45, ease: easeOut }}
            >
              {step === "checkout" && <CheckoutStep state={state} onChange={refresh} />}
              {step === "upload" && <UploadStep state={state} onSubmitted={refresh} />}
              {step === "analyzing" && (
                <WorkingStep
                  title="Menganalisis fotomu"
                  lines={["Memeriksa kualitas foto", "Membaca undertone dan kontras", "Mengamati proporsi siluet"]}
                />
              )}
              {step === "product" && <ProductStep state={state} onSubmitted={refresh} />}
              {step === "tryon" && (
                <WorkingStep
                  title="Menyiapkan virtual try-on"
                  lines={["Mengirim foto ke mesin try-on", "Menyesuaikan pakaian ke posemu", "Menyimpan hasil secara privat"]}
                  note="Biasanya selesai dalam 15–40 detik."
                />
              )}
              {step === "done" && <DoneStep state={state} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step | null }) {
  const order = STEPS.map((s) => s.id);
  const normalized = current === "tryon" ? "product" : current;
  const index = normalized ? order.indexOf(normalized) : -1;
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Langkah">
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

function Heading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">{title}</h1>
      {children && <p className="mt-4 max-w-xl leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

function PrimaryButton({
  children,
  busy,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`${className} group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-ink/40`}
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-medium underline underline-offset-2">
            Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

// Step 1 -------------------------------------------------------------------------

function CheckoutStep({ state, onChange }: { state: FlowState; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payment = state.payment;
  const pending = payment?.status === "pending";
  const lapsed = payment && (payment.status === "expired" || payment.status === "failed");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
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
        <Heading eyebrow="Langkah 1 · Pembayaran" title={<>Satu token, <em className="text-accent">satu paket lengkap</em>.</>}>
          Bayar sekali dengan QRIS. Token diterbitkan setelah pembayaran terverifikasi oleh server, bukan oleh
          browser.
        </Heading>
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
            <QrCode size={15} /> QRIS
          </span>
        </div>
        <div className="my-5 border-t border-dashed border-line" />
        <div className="space-y-2 font-mono text-xs text-muted">
          <div className="flex justify-between">
            <span>1× Token FLICKS</span>
            <span className="text-ink">{rupiah(state.priceIdr)}</span>
          </div>
          <div className="flex justify-between">
            <span>Biaya tersembunyi</span>
            <span className="text-ink">Rp0</span>
          </div>
        </div>
        <div className="my-5 border-t border-dashed border-line" />
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Total</span>
          <span className="font-display text-4xl text-ink">{rupiah(state.priceIdr)}</span>
        </div>

        {pending ? (
          <div className="mt-6 text-center">
            <QrBox url={payment.qrUrl} simulated={payment.simulated} />
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Menunggu pembayaran…
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted/80">{payment.orderId}</p>
            {payment.simulated && (
              <button
                onClick={() => run(() => api("/api/checkout/simulate", { method: "POST" }))}
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
            <PrimaryButton
              className="w-full"
              busy={busy}
              disabled={!state.paidFeaturesEnabled}
              onClick={() => run(() => api("/api/checkout", { method: "POST" }))}
            >
              Bayar {rupiah(state.priceIdr)} dengan QRIS <ArrowRight size={16} />
            </PrimaryButton>
            {!state.paidFeaturesEnabled && (
              <p className="mt-3 text-sm text-red-900">Pembelian sedang dihentikan sementara.</p>
            )}
          </div>
        )}
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </div>
    </div>
  );
}

function QrBox({ url, simulated }: { url: string | null; simulated: boolean }) {
  if (url && !simulated) {
    // eslint-disable-next-line @next/next/no-img-element -- QR image served by Midtrans
    return <img src={url} alt="Kode QRIS untuk pembayaran" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />;
  }
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

// Step 2 -------------------------------------------------------------------------

function UploadStep({ state, onSubmitted }: { state: FlowState; onSubmitted: () => void }) {
  const [face, setFace] = useState<File | null>(null);
  const [body, setBody] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per set of photos: resubmitting the same photos can never start a second job.
  const keyRef = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, [face, body]);

  const retake = state.analysis?.status === "needs_retake";
  const failed = state.analysis?.status === "failed";

  async function submit() {
    if (!face || !body || !consent || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("face", face);
    form.set("body", body);
    form.set("consent", "true");
    form.set("idempotencyKey", keyRef.current);
    try {
      await api("/api/analysis", { method: "POST", body: form });
      onSubmitted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <Heading eyebrow="Langkah 2 · Foto & persetujuan" title={<>Dua foto, <em className="text-accent">cahaya alami</em>.</>}>
        Kualitas foto paling menentukan hasil. Foto diperiksa dulu sebelum dikirim ke layanan AI, jadi foto yang tidak
        layak tidak akan memakai tokenmu.
      </Heading>

      {retake && (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-ink">
          <p className="font-medium">Foto sebelumnya belum cukup jelas untuk dianalisis. Token kamu tidak terpakai.</p>
          {state.analysis!.photoIssues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {state.analysis!.photoIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {failed && (
        <div className="mt-6">
          <ErrorBox message={state.analysis!.error ?? "Analisis gagal. Token kamu tidak terpakai, silakan coba lagi."} />
        </div>
      )}

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <PhotoDrop
          label="Foto wajah"
          hint="Untuk personal color"
          aspect="aspect-square"
          file={face}
          onChange={setFace}
          disabled={busy}
          tips={["Cahaya siang dari jendela, tanpa lampu kuning", "Tanpa filter dan makeup tebal", "Rambut tidak menutupi wajah"]}
        />
        <PhotoDrop
          label="Foto seluruh badan"
          hint="Untuk body shape & try-on"
          aspect="aspect-[3/4]"
          file={body}
          onChange={setBody}
          disabled={busy}
          tips={["Berdiri tegak menghadap kamera", "Terlihat dari kepala sampai kaki", "Pakaian pas badan, latar polos"]}
        />
      </div>

      <div className="mt-10 rounded-[1.75rem] border border-line bg-paper p-5 sm:p-6">
        <p className="flex items-center gap-2 font-medium text-ink">
          <ShieldCheck size={18} className="text-accent-deep" /> Sebelum kamu mengunggah
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>Yang dikumpulkan: satu foto wajah dan satu foto seluruh badan.</li>
          <li>Tujuannya: estimasi personal color, body shape, dan satu simulasi virtual try-on.</li>
          <li>Foto dikirim ke Google Gemini (analisis) dan FASHN (try-on) untuk diproses.</li>
          <li>Foto disimpan privat dan dihapus otomatis setelah 72 jam, bersama laporannya.</li>
          <li>Permintaan terkait data: hubungi tim FLICKS lewat kontak di halaman utama.</li>
        </ul>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-deep)]"
          />
          <span>Saya setuju foto saya diproses dan disimpan sementara seperti dijelaskan di atas.</span>
        </label>
      </div>

      {error && <div className="mt-6"><ErrorBox message={error} /></div>}

      <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <PrimaryButton busy={busy} disabled={!face || !body || !consent} onClick={submit}>
          Mulai analisis <Sparkles size={16} />
        </PrimaryButton>
        <p className="text-xs text-muted">
          {!face || !body ? "Unggah kedua foto dulu." : !consent ? "Centang persetujuan untuk melanjutkan." : "Siap dianalisis."}
        </p>
      </div>
    </div>
  );
}

// Waiting states ---------------------------------------------------------------------

function WorkingStep({ title, lines, note }: { title: string; lines: string[]; note?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 2200);
    return () => clearInterval(t);
  }, [lines.length]);

  return (
    <div className="flex flex-col items-center py-16 text-center" role="status" aria-live="polite">
      <div className="relative h-28 w-28">
        <motion.span
          className="absolute inset-0 rounded-full border border-accent/40"
          animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.span
          className="absolute inset-3 rounded-full bg-[conic-gradient(var(--color-accent-deep),var(--color-accent-light),var(--color-cream),var(--color-accent-deep))]"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <span className="absolute inset-6 rounded-full bg-cream" />
      </div>
      <h1 className="mt-8 font-display text-4xl text-ink">{title}</h1>
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-3 text-muted"
        >
          {lines[i]}…
        </motion.p>
      </AnimatePresence>
      {note && <p className="mt-6 text-xs text-muted">{note}</p>}
      <p className="mt-2 text-xs text-muted">Halaman ini boleh direfresh. Progres tersimpan di server.</p>
    </div>
  );
}

// Step 4 -------------------------------------------------------------------------

function ProductStep({ state, onSubmitted }: { state: FlowState; onSubmitted: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [selected, setSelected] = useState<string | null>(state.tryon?.productId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = state.tryon?.status === "failed";

  useEffect(() => {
    api<Product[]>("/api/products").then(setProducts, (e) => setError(e.message));
  }, []);

  async function submit() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/virtual-try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: state.analysis!.id, productId: selected }),
      });
      onSubmitted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <Heading eyebrow="Langkah 3 · Virtual Try-On" title={<>Analisis selesai. <em className="text-accent">Pilih satu pakaian</em>.</>}>
        Tokenmu berlaku untuk satu simulasi. Pilihan tidak bisa diganti setelah try-on diproses.
      </Heading>

      {state.reportPath && (
        <p className="mt-4 text-sm text-muted">
          Hasil analisis sudah bisa dilihat di{" "}
          <Link href={state.reportPath} className="font-medium text-accent-deep underline underline-offset-2">
            laporanmu
          </Link>
          .
        </p>
      )}
      {failed && (
        <div className="mt-6">
          <ErrorBox message="Virtual try-on sebelumnya gagal di sisi penyedia. Kamu bisa mencoba sekali lagi." />
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {!products && !error && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-[1.5rem] bg-line/50" />
        ))}
        {products?.map((p) => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              disabled={busy}
              aria-pressed={active}
              className={`group overflow-hidden rounded-[1.5rem] border bg-paper text-left transition ${
                active ? "border-accent-deep ring-2 ring-accent-deep/30" : "border-line hover:border-accent"
              }`}
            >
              <div className="relative aspect-[3/4] bg-cream">
                <Image src={p.image} alt={p.name} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                {active && (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-deep text-paper">
                    <Check size={14} />
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-ink">{p.name}</p>
                <p className="text-xs text-muted">{p.subcategory} · {p.silhouette.join(", ")}</p>
              </div>
            </button>
          );
        })}
      </div>

      {error && <div className="mt-6"><ErrorBox message={error} /></div>}

      <div className="mt-8">
        <PrimaryButton busy={busy} disabled={!selected} onClick={submit}>
          Coba pakaian ini <ArrowRight size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

// Step 5 -------------------------------------------------------------------------

function DoneStep({ state }: { state: FlowState }) {
  const [copied, setCopied] = useState(false);
  const url = state.reportPath ? `${window.location.origin}${state.reportPath}` : null;

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-deep text-paper"
      >
        <Check size={28} />
      </motion.span>
      <h1 className="mt-6 font-display text-5xl text-ink">Laporanmu siap</h1>
      <p className="mt-3 max-w-md text-muted">
        Simpan tautan rahasia ini. Siapa pun yang memegangnya bisa membuka laporan, dan tautan berhenti berfungsi
        setelah 72 jam.
      </p>

      {url ? (
        <>
          <div className="mt-8 flex w-full max-w-lg items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-5 pr-1.5">
            <span className="flex-1 truncate text-left font-mono text-xs text-muted">{url}</span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* clipboard blocked: the link stays visible to copy by hand */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-xs font-medium text-ink hover:bg-accent-soft"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Tersalin" : "Salin"}
            </button>
          </div>
          <Link
            href={state.reportPath!}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper hover:bg-accent-deep"
          >
            Buka laporan <ArrowRight size={16} />
          </Link>
        </>
      ) : (
        <p className="mt-8 text-sm text-muted">Tautan laporan hanya tersedia di browser yang dipakai untuk analisis.</p>
      )}
    </div>
  );
}
