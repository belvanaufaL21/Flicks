"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Link2, Lock, ScanLine } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { brand } from "@/lib/brand";

// Looping, coded walk-throughs of each step, shown inside a phone frame.
// Each demo cycles through a few "screens"; it only runs while its step is
// active, and the parent remounts it on activation so it always starts fresh.

type DemoProps = { active: boolean };

function usePhase(durations: readonly number[], active: boolean) {
  const [phase, setPhase] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!active || reduce) return;
    const id = setTimeout(() => setPhase((p) => (p + 1) % durations.length), durations[phase]);
    return () => clearTimeout(id);
  }, [active, reduce, phase, durations]);

  // With reduced motion, hold on the most informative (final) screen.
  return reduce ? durations.length - 1 : phase;
}

// Demos are laid out at one fixed phone size and scaled with `zoom`, so their
// content wraps the same way on every screen.
export function DemoPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[535px] w-[260px] shrink-0 rounded-[2.6rem] bg-ink p-2.5 shadow-[0_40px_80px_-30px_rgba(37,34,31,0.6)] [zoom:0.74] sm:[zoom:0.85] lg:[zoom:1] lg:[@media(max-height:800px)]:[zoom:0.86] lg:[@media(max-height:680px)]:[zoom:0.72]">
      <div className="absolute left-1/2 top-4 z-20 h-4 w-16 -translate-x-1/2 rounded-full bg-ink" />
      <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-paper text-ink">
        <div className="flex items-center justify-between px-6 pt-3 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="tracking-tighter">▮▮▮</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-9">{children}</div>
      </div>
    </div>
  );
}

// A fingertip "tap" ripple at a position inside the screen.
function Tap({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 1.6 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [1.6, 1, 0.85, 1.4] }}
      transition={{ duration: 0.9, delay, times: [0, 0.3, 0.6, 1] }}
      className={`pointer-events-none absolute z-30 h-9 w-9 rounded-full border-2 border-accent bg-accent/25 ${className}`}
    />
  );
}

function Screen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35, ease: easeOut }}
      className={`absolute inset-0 flex flex-col px-5 pb-5 pt-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}

const label = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted";

/* ---------- 1. Buy a token with QRIS ---------- */

const payDurations = [2000, 2600, 1700, 2400] as const;

// Deterministic pseudo-QR pattern (11×11) with three finder corners.
const qrCells = Array.from({ length: 121 }, (_, i) => {
  const r = Math.floor(i / 11);
  const c = i % 11;
  const finder = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
  return finder || (r * 7 + c * 13 + r * c) % 5 < 2;
});

export function PayDemo({ active }: DemoProps) {
  const phase = usePhase(payDurations, active);
  return (
    <AnimatePresence mode="wait">
      {phase === 0 && (
        <Screen key="checkout">
          <p className={label}>Checkout</p>
          <p className="mt-2 font-display text-2xl">1 Token FLICKS</p>
          <ul className="mt-4 space-y-2 text-xs text-muted">
            {["Personal color", "Body shape", "Virtual try-on"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check size={12} className="text-accent-deep" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-baseline justify-between border-t border-dashed border-line pt-3">
            <span className="text-xs text-muted">Total</span>
            <span className="font-display text-2xl">Rp19.000</span>
          </div>
          <div className="relative mt-3 rounded-full bg-ink py-3 text-center text-xs font-medium text-paper">
            Bayar via QRIS
            <Tap className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" delay={1.1} />
          </div>
        </Screen>
      )}
      {phase === 1 && (
        <Screen key="qr" className="items-center text-center">
          <p className={label}>Scan untuk bayar</p>
          <div className="mt-5 grid grid-cols-11 gap-[2px] rounded-2xl bg-cream p-3">
            {qrCells.map((on, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: on ? 1 : 0, scale: 1 }}
                transition={{ delay: (i % 11) * 0.03 + Math.floor(i / 11) * 0.03 }}
                className="h-2.5 w-2.5 rounded-[2px] bg-ink"
              />
            ))}
          </div>
          <p className="mt-4 font-display text-2xl">Rp19.000</p>
          <p className="text-[11px] text-muted">Buka e-wallet atau m-banking, lalu scan.</p>
          <motion.div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-line">
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0.15 }}
              transition={{ duration: 2.6, ease: "linear" }}
              className="h-full origin-left bg-accent"
            />
          </motion.div>
        </Screen>
      )}
      {phase === 2 && (
        <Screen key="verify" className="items-center justify-center text-center">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, ease: "linear", repeat: Infinity }}
            className="h-12 w-12 rounded-full border-[3px] border-line border-t-accent"
          />
          <p className="mt-5 text-sm font-medium">Memverifikasi pembayaran</p>
          <p className="mt-1 text-[11px] text-muted">Dicek langsung oleh server</p>
        </Screen>
      )}
      {phase === 3 && (
        <Screen key="done" className="items-center justify-center text-center">
          <motion.span
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-deep text-paper"
          >
            <Check size={30} />
          </motion.span>
          <p className="mt-5 font-display text-2xl">Token aktif</p>
          <p className="mt-1 text-[11px] text-muted">1 token siap dipakai</p>
        </Screen>
      )}
    </AnimatePresence>
  );
}

/* ---------- 2. Upload a photo ---------- */

const uploadDurations = [2600, 1900, 2400, 2600] as const;

export function UploadDemo({ active }: DemoProps) {
  const phase = usePhase(uploadDurations, active);
  return (
    <AnimatePresence mode="wait">
      {phase === 0 && (
        <Screen key="guide">
          <p className={label}>Panduan foto</p>
          <p className="mt-2 font-display text-2xl leading-tight">Biar hasilnya lebih akurat</p>
          <ul className="mt-5 space-y-3 text-xs">
            {["Cahaya alami & merata", "Tanpa filter", "Latar belakang polos", "Badan terlihat penuh"].map((t, i) => (
              <li key={t} className="flex items-center gap-3">
                <motion.span
                  initial={{ backgroundColor: "rgba(0,0,0,0)", scale: 0.8 }}
                  animate={{ backgroundColor: brand.accentDeep, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.45 }}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-accent-deep text-paper"
                >
                  <Check size={11} />
                </motion.span>
                {t}
              </li>
            ))}
          </ul>
        </Screen>
      )}
      {phase === 1 && (
        <Screen key="consent">
          <p className={label}>Persetujuan</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Foto diproses oleh Google Gemini dan FASHN, disimpan privat, dan terhapus sesuai masa
            retensi 72 jam.
          </p>
          <div className="relative mt-5 flex items-start gap-3 rounded-2xl border border-line p-3 text-xs">
            <motion.span
              initial={{ backgroundColor: "rgba(0,0,0,0)" }}
              animate={{ backgroundColor: brand.ink }}
              transition={{ delay: 0.8 }}
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ink text-paper"
            >
              <Check size={10} />
            </motion.span>
            Saya setuju foto saya diproses untuk laporan ini.
            <Tap className="-left-1 -top-1" delay={0.4} />
          </div>
          <div className="mt-auto rounded-full bg-ink py-3 text-center text-xs font-medium text-paper">
            Lanjut upload
          </div>
        </Screen>
      )}
      {phase >= 2 && (
        <Screen key="photo">
          <p className={label}>{phase === 2 ? "Mengunggah" : "Pengecekan foto"}</p>
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            className="relative mt-3 flex-1 overflow-hidden rounded-2xl bg-[#e3cfb3]"
          >
            <Image src="/images/model-before.webp" alt="" fill sizes="220px" className="object-cover object-top" />
            {phase === 3 && (
              <div className="absolute inset-x-2 bottom-2 space-y-1.5">
                {["Pencahayaan cukup", "Wajah & tubuh jelas"].map((t, i) => (
                  <motion.p
                    key={t}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.3 }}
                    className="flex items-center gap-1.5 rounded-full bg-paper/90 px-2.5 py-1 text-[10px] font-medium backdrop-blur"
                  >
                    <Check size={10} className="text-accent-deep" /> {t}
                  </motion.p>
                ))}
              </div>
            )}
          </motion.div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: phase === 2 ? 1.8 : 0, ease: "easeInOut" }}
              className="h-full origin-left bg-accent"
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">{phase === 2 ? "Mengunggah foto…" : "Foto layak diproses"}</p>
        </Screen>
      )}
    </AnimatePresence>
  );
}

/* ---------- 3. AI reads color & body shape ---------- */

const analyzeDurations = [2400, 2300, 2300, 3000] as const;
const palette = ["#b5835a", "#8a9a5b", "#a26769", "#d4a373", "#6b7f6a"];
// Body landmarks as a share of photo height, with relative widths.
const landmarks = [
  { name: "Bahu", top: "29%", width: "46%" },
  { name: "Pinggang", top: "43%", width: "28%" },
  { name: "Pinggul", top: "52%", width: "44%" },
];

export function AnalyzeDemo({ active }: DemoProps) {
  const phase = usePhase(analyzeDurations, active);
  return (
    <div className="absolute inset-0 bg-[#e3cfb3]">
      <Image src="/images/model-before.webp" alt="" fill sizes="240px" className="object-cover object-top" />

      {phase === 0 && (
        <motion.div
          animate={{ top: ["12%", "78%", "12%"] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
          className="absolute inset-x-4 h-0.5 rounded-full bg-accent shadow-[0_0_24px_6px_rgba(154,128,96,0.5)]"
        />
      )}

      {phase === 2 &&
        landmarks.map((l, i) => (
          <motion.div
            key={l.name}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.35, duration: 0.6, ease: easeOut }}
            style={{ top: l.top, width: l.width }}
            className="absolute left-1/2 flex -translate-x-1/2 items-center"
          >
            <span className="h-2 w-2 rounded-full bg-paper ring-2 ring-accent" />
            <span className="h-px flex-1 border-t border-dashed border-paper" />
            <span className="h-2 w-2 rounded-full bg-paper ring-2 ring-accent" />
            <span className="absolute -top-4 left-full ml-1 whitespace-nowrap rounded-full bg-ink/80 px-1.5 py-0.5 text-[9px] text-paper">
              {l.name}
            </span>
          </motion.div>
        ))}

      {/* Bottom sheet */}
      <motion.div
        layout
        transition={{ duration: 0.45, ease: easeOut }}
        className="absolute inset-x-3 bottom-3 rounded-2xl bg-paper/95 p-3 backdrop-blur"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {phase === 0 && (
              <p className="flex items-center gap-2 text-xs font-medium">
                <ScanLine size={14} className="text-accent-deep" /> Menganalisis foto…
              </p>
            )}
            {phase === 1 && (
              <div>
                <p className={label}>Personal color</p>
                <div className="mt-2 flex gap-1.5">
                  {palette.map((c, i) => (
                    <motion.span
                      key={c}
                      initial={{ scale: 0, y: -40 }}
                      animate={{ scale: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 16, delay: i * 0.12 }}
                      className="h-6 w-6 rounded-full ring-2 ring-paper"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}
            {phase === 2 && (
              <div>
                <p className={label}>Body shape</p>
                <p className="mt-1 text-xs text-muted">Membandingkan bahu, pinggang, pinggul</p>
              </div>
            )}
            {phase === 3 && (
              <div className="space-y-2">
                {[
                  ["Personal color", "Soft Autumn"],
                  ["Body shape", "Hourglass"],
                ].map(([k, v], i) => (
                  <motion.div
                    key={k}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.25 }}
                    className="flex items-end justify-between"
                  >
                    <div>
                      <p className={label}>{k}</p>
                      <p className="font-display text-lg leading-tight">{v}</p>
                    </div>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-medium text-accent-deep">
                      keyakinan sedang
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ---------- 4. Try on one outfit ---------- */

const tryOnDurations = [2200, 1500, 2000, 3200] as const;
const products = [
  { name: "Wrap Blouse", color: "#b07f86" },
  { name: "Linen Shirt", color: "#d9c3a5" },
  { name: "Knit Top", color: "#8e9a7e" },
  { name: "Basic Tee", color: "#3a3632" },
];
const garment = "M14 6 L8 9 L4 16 L9 18 L10 15 L10 34 L30 34 L30 15 L31 18 L36 16 L32 9 L26 6 Q20 10 14 6 Z";

export function TryOnDemo({ active }: DemoProps) {
  const phase = usePhase(tryOnDurations, active);
  return (
    <AnimatePresence mode="wait">
      {phase <= 1 && (
        <Screen key="catalog">
          <p className={label}>Pilih satu produk</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {products.map((p, i) => {
              const picked = phase === 1 && i === 0;
              return (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, scale: picked ? 1.04 : 1 }}
                  transition={{ delay: phase === 0 ? i * 0.1 : 0 }}
                  className={`relative rounded-2xl bg-cream p-2.5 ring-2 transition-colors ${
                    picked ? "ring-accent" : "ring-transparent"
                  }`}
                >
                  <svg viewBox="0 0 40 40" className="mx-auto h-14 w-14">
                    <path d={garment} fill={p.color} />
                  </svg>
                  <p className="mt-1 text-[10px] font-medium">{p.name}</p>
                  {picked && (
                    <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-paper">
                      <Check size={10} />
                    </span>
                  )}
                  {phase === 0 && i === 0 && <Tap className="left-1/2 top-8 -translate-x-1/2" delay={1.3} />}
                </motion.div>
              );
            })}
          </div>
          <div
            className={`mt-auto rounded-full py-3 text-center text-xs font-medium transition-colors ${
              phase === 1 ? "bg-ink text-paper" : "bg-line text-muted"
            }`}
          >
            Coba sekarang
          </div>
        </Screen>
      )}
      {phase === 2 && (
        <Screen key="render" className="items-center justify-center text-center">
          <svg viewBox="0 0 50 50" className="h-16 w-16 -rotate-90">
            <circle cx="25" cy="25" r="21" fill="none" stroke={brand.line} strokeWidth="4" />
            <motion.circle
              cx="25"
              cy="25"
              r="21"
              fill="none"
              stroke={brand.accent}
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
            />
          </svg>
          <p className="mt-5 text-sm font-medium">Membuat simulasi try-on</p>
          <p className="mt-1 text-[11px] text-muted">Wrap Blouse · Dusty Rose</p>
        </Screen>
      )}
      {phase === 3 && (
        <Screen key="result" className="px-0 pb-0 pt-0">
          <div className="relative flex-1 bg-[#e3cfb3]">
            <Image src="/images/model-before.webp" alt="" fill sizes="240px" className="object-cover object-top" />
            <motion.div
              initial={{ clipPath: "inset(0 0 0 100%)" }}
              animate={{ clipPath: "inset(0 0 0 0%)" }}
              transition={{ duration: 1.2, ease: easeOut, delay: 0.3 }}
              className="absolute inset-0"
            >
              <Image src="/images/model-after.webp" alt="" fill sizes="240px" className="object-cover object-top" />
            </motion.div>
            <span className="absolute left-3 top-2 rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium text-paper">
              Hasil try-on
            </span>
          </div>
        </Screen>
      )}
    </AnimatePresence>
  );
}

/* ---------- 5. Open the private report ---------- */

const reportDurations = [2000, 3800, 2400] as const;

export function ReportDemo({ active }: DemoProps) {
  const phase = usePhase(reportDurations, active);
  return (
    <AnimatePresence mode="wait">
      {phase === 0 && (
        <Screen key="link" className="justify-center">
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="relative rounded-2xl bg-cream p-4 shadow-sm"
          >
            <p className={label}>FLICKS Lite</p>
            <p className="mt-1 text-sm font-medium">Laporanmu sudah siap.</p>
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-paper px-3 py-2 font-mono text-[10px] text-accent-deep">
              <Link2 size={12} /> /report/a8f3…e21c
            </p>
            <Tap className="bottom-1 left-1/2 -translate-x-1/2" delay={1.1} />
          </motion.div>
        </Screen>
      )}
      {phase >= 1 && (
        <Screen key="report" className="px-0 pb-0 pt-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              <Lock size={10} /> Privat
            </span>
            <motion.span
              animate={phase === 2 ? { scale: [1, 1.15, 1], backgroundColor: brand.accent, color: brand.paper } : {}}
              transition={{ duration: 0.6 }}
              className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-medium text-accent-deep"
            >
              71:59:58
            </motion.span>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <motion.div
              animate={{ y: phase === 1 ? ["0%", "-42%"] : "-42%" }}
              transition={{ duration: 3.2, ease: "easeInOut", delay: 0.3 }}
              className="space-y-3 p-4"
            >
              <div className="rounded-2xl bg-gradient-to-br from-accent-soft via-line to-accent/70 p-4">
                <p className={label}>Estimasi season</p>
                <p className="mt-1 font-display text-2xl">Soft Autumn</p>
              </div>
              <div className="flex gap-1.5">
                {palette.map((c) => (
                  <span key={c} className="h-8 flex-1 rounded-lg" style={{ background: c }} />
                ))}
              </div>
              <div className="rounded-2xl bg-cream p-4">
                <p className={label}>Body shape</p>
                <p className="mt-1 font-display text-xl">Hourglass</p>
                <p className="text-[10px] text-muted">Wrap dress, high-waist, belt di pinggang</p>
              </div>
              <div className="relative h-44 overflow-hidden rounded-2xl bg-[#e3cfb3]">
                <Image src="/images/model-after.webp" alt="" fill sizes="220px" className="object-cover object-top" />
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                Hasil berupa estimasi dan saran gaya, bukan diagnosis.
              </p>
            </motion.div>
            {phase === 2 && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-x-3 bottom-3 rounded-2xl bg-ink px-4 py-3 text-center text-[11px] text-paper"
              >
                Tautan otomatis ditutup setelah 72 jam
              </motion.p>
            )}
          </div>
        </Screen>
      )}
    </AnimatePresence>
  );
}
