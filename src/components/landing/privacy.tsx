"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { Check, Lock, Server, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { DomeSection } from "@/components/motion/shapes";
import { brand } from "@/lib/brand";
import { SectionHeading } from "./section-heading";

// The four points double as the four stages of a photo's life, played on the vault.
const points = [
  {
    icon: ShieldCheck,
    title: "Persetujuan dulu",
    body: "AI tidak berjalan sebelum kamu mencentang persetujuan pemrosesan dan penyimpanan foto.",
  },
  {
    icon: Lock,
    title: "Penyimpanan privat",
    body: "Foto disimpan di storage privat dan hanya bisa diakses lewat tautan bertanda tangan dari server.",
  },
  {
    icon: Server,
    title: "Pihak ketiga yang jelas",
    body: "Foto diproses oleh Google Gemini (analisis warna & bentuk tubuh) dan FASHN (virtual try-on). Kami sebutkan sebelum kamu upload.",
  },
  {
    icon: Timer,
    title: "Masa retensi 72 jam",
    body: "Tautan laporan kedaluwarsa setelah 72 jam, dan foto dijadwalkan terhapus sesuai kebijakan retensi.",
  },
];

const STAGE_MS = 3200;

export function Privacy() {
  const ref = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);
  const inView = useInView(vaultRef, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [cycle, setCycle] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const glowX = useTransform(scrollYProgress, [0, 1], ["-20%", "60%"]);

  // Advance through the stages while the vault is on screen; the last stage runs longer
  // so the countdown and deletion can finish before the loop restarts.
  useEffect(() => {
    if (!inView || reduce) return;
    const id = setTimeout(
      () => {
        if (stage === points.length - 1) setCycle((c) => c + 1);
        setStage((s) => (s + 1) % points.length);
      },
      stage === points.length - 1 ? STAGE_MS * 1.4 : STAGE_MS,
    );
    return () => clearTimeout(id);
  }, [inView, reduce, stage]);

  const choose = (i: number) => {
    setStage(i);
    setCycle((c) => c + 1);
  };

  return (
    <DomeSection id="privasi" className="bg-ink pt-32 pb-24 lg:pb-32">
      <motion.div
        style={{ x: glowX }}
        className="pointer-events-none absolute -top-40 left-0 h-[500px] w-[700px] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-accent)_35%,transparent),transparent)]"
      />
      <div ref={ref} className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          tone="dark"
          eyebrow="Privasi & transparansi"
          title={
            <>
              Fotomu tetap <em className="text-accent-light">milikmu</em>.
            </>
          }
          description="Kami hanya memakai foto untuk membuat laporanmu, dan menjelaskan ke mana foto itu dikirim sebelum kamu mengunggahnya."
        />

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-12">
          <div className="order-2 space-y-10 lg:order-1">
            {points.slice(0, 2).map((p, i) => (
              <Point key={p.title} {...p} side="left" index={i} active={stage === i} onSelect={() => choose(i)} />
            ))}
          </div>
          <div ref={vaultRef} className="order-1 lg:order-2">
            <PhotoVault stage={reduce ? 1 : stage} cycle={cycle} />
          </div>
          <div className="order-3 space-y-10">
            {points.slice(2).map((p, i) => (
              <Point
                key={p.title}
                {...p}
                side="right"
                index={i + 2}
                active={stage === i + 2}
                onSelect={() => choose(i + 2)}
              />
            ))}
          </div>
        </div>
      </div>
    </DomeSection>
  );
}

/* ---------- The vault: one photo, four stages ---------- */

function PhotoVault({ stage, cycle }: { stage: number; cycle: number }) {
  const deleting = stage === 3;

  return (
    <div className="relative mx-auto w-64 sm:w-72">
      {/* Slow concentric rings behind the photo */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ rotate: i % 2 ? -360 : 360 }}
          transition={{ duration: 40 - i * 10, ease: "linear", repeat: Infinity }}
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-paper/15"
          style={{ width: `${150 + i * 28}%` }}
        />
      ))}

      {/* Shield glow that brightens while the photo is locked */}
      <motion.span
        animate={{ opacity: stage === 1 ? 1 : 0.35, scale: stage === 1 ? 1.05 : 1 }}
        transition={{ duration: 0.8, ease: easeOut }}
        className="pointer-events-none absolute -inset-6 rounded-t-full rounded-b-[3rem] bg-[radial-gradient(closest-side,rgba(201,179,143,0.35),transparent)]"
      />

      <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[2.5rem] bg-[#e3cfb3] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-paper/20">
        <motion.div
          key={cycle}
          className="absolute inset-0"
          animate={
            deleting
              ? { filter: ["blur(0px)", "blur(0px)", "blur(14px)"], opacity: [1, 1, 0], scale: [1, 1, 1.08] }
              : { filter: stage === 1 ? "blur(6px)" : "blur(0px)", opacity: 1, scale: 1 }
          }
          transition={
            deleting
              ? { duration: STAGE_MS * 0.0011, times: [0, 0.55, 1], ease: "easeIn" }
              : { duration: 0.7, ease: easeOut }
          }
        >
          <Image
            src="/images/model-before.webp"
            alt="Contoh foto yang diunggah pengguna"
            fill
            sizes="300px"
            className="object-cover object-[50%_12%]"
          />
        </motion.div>

        {/* Darkening veil while locked or deleted */}
        <motion.div
          animate={{ opacity: stage === 1 ? 0.45 : deleting ? 0.2 : 0 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0 bg-ink"
        />

        <AnimatePresence mode="wait">
          {stage === 0 && <ConsentStage key={`consent-${cycle}`} />}
          {stage === 1 && <LockStage key={`lock-${cycle}`} />}
          {stage === 2 && <ProviderStage key={`providers-${cycle}`} />}
          {stage === 3 && <DeleteStage key={`delete-${cycle}`} />}
        </AnimatePresence>
      </div>

      {/* Stage progress */}
      <div className="mt-5 flex justify-center gap-2">
        {points.map((p, i) => (
          <motion.span
            key={p.title}
            animate={{ width: i === stage ? 28 : 8, opacity: i === stage ? 1 : 0.35 }}
            transition={{ duration: 0.4, ease: easeOut }}
            className="h-1.5 rounded-full bg-accent-light"
          />
        ))}
      </div>
    </div>
  );
}

const chip =
  "flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-1.5 text-[11px] font-medium text-ink shadow-lg";

function StageLayer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={`absolute inset-0 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function ConsentStage() {
  return (
    <StageLayer className="flex items-end justify-center p-4">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20, delay: 0.2 }}
        className="flex w-full items-center gap-2.5 rounded-2xl bg-paper/95 p-3 text-[11px] leading-snug text-ink shadow-lg"
      >
        <motion.span
          initial={{ backgroundColor: "rgba(0,0,0,0)" }}
          animate={{ backgroundColor: brand.ink }}
          transition={{ delay: 1 }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-ink text-paper"
        >
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.05, type: "spring" }}>
            <Check size={12} />
          </motion.span>
        </motion.span>
        Saya setuju foto ini diproses untuk laporan saya.
      </motion.div>
    </StageLayer>
  );
}

function LockStage() {
  return (
    <StageLayer className="flex flex-col items-center justify-center gap-4">
      <span className="relative flex h-20 w-20 items-center justify-center">
        {[0, 1].map((r) => (
          <motion.span
            key={r}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: r * 0.9, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-accent-light"
          />
        ))}
        <motion.span
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.15 }}
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-paper text-ink shadow-xl"
        >
          <Lock size={30} />
        </motion.span>
      </span>
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className={chip}
      >
        Hanya bisa dibuka lewat tautanmu
      </motion.p>
    </StageLayer>
  );
}

function ProviderStage() {
  const providers = [
    { name: "Google Gemini", role: "Warna & bentuk tubuh", top: "22%" },
    { name: "FASHN", role: "Virtual try-on", top: "60%" },
  ];
  return (
    <StageLayer>
      {/* Data packets travelling from the photo to each provider */}
      {providers.map((p, i) => (
        <motion.span
          key={`dot-${p.name}`}
          initial={{ left: "50%", opacity: 0 }}
          animate={{ left: ["50%", "88%"], opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 + i * 0.5, ease: "easeInOut" }}
          style={{ top: `calc(${p.top} + 18px)` }}
          className="absolute h-2 w-2 rounded-full bg-accent-light shadow-[0_0_10px_rgba(201,179,143,0.9)]"
        />
      ))}
      {providers.map((p, i) => (
        <motion.div
          key={p.name}
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.15 + i * 0.25 }}
          style={{ top: p.top }}
          className="absolute right-3 rounded-2xl bg-paper/95 px-3 py-2 text-ink shadow-lg"
        >
          <p className="text-[11px] font-semibold">{p.name}</p>
          <p className="text-[10px] text-muted">{p.role}</p>
        </motion.div>
      ))}
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7 }}
        className={`${chip} absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap`}
      >
        Dikirim hanya untuk diproses AI
      </motion.p>
    </StageLayer>
  );
}

function DeleteStage() {
  const ref = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);

  // Fast-forward the 72-hour clock, then reveal the deleted state.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const controls = animate(72 * 3600, 0, {
      duration: 1.7,
      ease: [0.6, 0, 0.9, 1],
      onUpdate: (v) => {
        const s = Math.max(0, Math.round(v));
        node.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
      },
      onComplete: () => setGone(true),
    });
    return () => controls.stop();
  }, []);

  return (
    <StageLayer className="flex flex-col items-center justify-center gap-3">
      <AnimatePresence mode="wait">
        {!gone ? (
          <motion.div
            key="clock"
            exit={{ opacity: 0, scale: 0.9 }}
            className="rounded-2xl bg-paper/95 px-4 py-3 text-center text-ink shadow-lg"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Sisa waktu</p>
            <span ref={ref} className="font-display text-3xl tabular-nums">
              72:00:00
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="gone"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="flex flex-col items-center gap-3"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-ink shadow-xl">
              <Trash2 size={26} />
            </span>
            <p className={chip}>Foto & tautan dihapus</p>
          </motion.div>
        )}
      </AnimatePresence>
    </StageLayer>
  );
}

/* ---------- Side points ---------- */

function Point({
  icon: Icon,
  title,
  body,
  side,
  index,
  active,
  onSelect,
}: (typeof points)[number] & {
  side: "left" | "right";
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const left = side === "left";
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, x: left ? -40 : 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.8, ease: easeOut, delay: 0.1 * (index % 2) }}
      className={`group flex w-full gap-5 text-left ${left ? "lg:flex-row-reverse lg:text-right" : ""}`}
    >
      <motion.span
        animate={{
          backgroundColor: active ? "rgba(201,179,143,1)" : "rgba(201,179,143,0)",
          color: active ? brand.ink : brand.accentLight,
          scale: active ? 1.08 : 1,
        }}
        transition={{ duration: 0.4 }}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-accent-light/40"
      >
        <Icon size={22} />
      </motion.span>
      <motion.span animate={{ opacity: active ? 1 : 0.5 }} transition={{ duration: 0.4 }} className="block">
        <span className="block font-display text-2xl text-paper">{title}</span>
        <span className="mt-2 block text-sm leading-relaxed text-paper/70">{body}</span>
      </motion.span>
    </motion.button>
  );
}
