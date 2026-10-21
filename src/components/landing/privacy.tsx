"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Lock, Server, ShieldCheck, Timer } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { DomeSection } from "@/components/motion/shapes";
import { SectionHeading } from "./section-heading";

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

// Concentric rings with orbiting dots around a locked core.
function Orbit() {
  const rings = [
    { inset: "0%", duration: 40, dots: 3 },
    { inset: "16%", duration: 28, dots: 2 },
    { inset: "32%", duration: 18, dots: 1 },
  ];
  return (
    <div className="relative mx-auto aspect-square w-64 sm:w-80" aria-hidden="true">
      {rings.map((r, i) => (
        <motion.div
          key={i}
          animate={{ rotate: i % 2 ? -360 : 360 }}
          transition={{ duration: r.duration, ease: "linear", repeat: Infinity }}
          className="absolute rounded-full border border-dashed border-paper/20"
          style={{ inset: r.inset }}
        >
          {Array.from({ length: r.dots }).map((_, d) => (
            <span key={d} className="absolute inset-0" style={{ rotate: `${(360 / r.dots) * d}deg` }}>
              <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-light shadow-[0_0_12px_rgba(201,179,143,0.8)]" />
            </span>
          ))}
        </motion.div>
      ))}
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
        className="absolute inset-[38%] flex items-center justify-center rounded-full bg-accent text-paper shadow-[0_0_60px_rgba(154,128,96,0.6)]"
      >
        <Lock size={28} />
      </motion.div>
    </div>
  );
}

export function Privacy() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const glowX = useTransform(scrollYProgress, [0, 1], ["-20%", "60%"]);

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

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-10">
          <div className="order-2 space-y-12 lg:order-1">
            {points.slice(0, 2).map((p, i) => (
              <Point key={p.title} {...p} side="left" index={i} />
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1, ease: easeOut }}
            className="order-1 lg:order-2"
          >
            <Orbit />
          </motion.div>
          <div className="order-3 space-y-12">
            {points.slice(2).map((p, i) => (
              <Point key={p.title} {...p} side="right" index={i} />
            ))}
          </div>
        </div>
      </div>
    </DomeSection>
  );
}

function Point({
  icon: Icon,
  title,
  body,
  side,
  index,
}: (typeof points)[number] & { side: "left" | "right"; index: number }) {
  const left = side === "left";
  return (
    <motion.div
      initial={{ opacity: 0, x: left ? -40 : 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.8, ease: easeOut, delay: 0.15 * index }}
      className={`flex gap-5 ${left ? "lg:flex-row-reverse lg:text-right" : ""}`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-accent-light/40 text-accent-light">
        <Icon size={22} />
      </span>
      <div>
        <h3 className="font-display text-2xl text-paper">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-paper/65">{body}</p>
      </div>
    </motion.div>
  );
}
