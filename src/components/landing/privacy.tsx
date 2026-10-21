"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Lock, Server, ShieldCheck, Timer } from "lucide-react";
import { fadeUp, Stagger } from "@/components/motion/reveal";
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

export function Privacy() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const glowX = useTransform(scrollYProgress, [0, 1], ["-20%", "60%"]);

  return (
    <section id="privasi" ref={ref} className="relative overflow-hidden bg-ink py-24 lg:py-32">
      <motion.div
        style={{ x: glowX }}
        className="pointer-events-none absolute -top-40 left-0 h-[500px] w-[700px] rounded-full bg-plum/50 blur-[120px]"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          tone="dark"
          eyebrow="Privasi & transparansi"
          title={
            <>
              Fotomu tetap <em className="text-rose">milikmu</em>.
            </>
          }
          description="Kami hanya memakai foto untuk membuat laporanmu, dan menjelaskan ke mana foto itu dikirim sebelum kamu mengunggahnya."
        />
        <Stagger className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {points.map(({ icon: Icon, title, body }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              className="rounded-3xl border border-paper/10 bg-paper/5 p-7 backdrop-blur"
            >
              <Icon className="text-rose" size={24} />
              <h3 className="mt-5 font-display text-2xl text-paper">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/65">{body}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
