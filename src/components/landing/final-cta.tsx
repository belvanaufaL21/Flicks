"use client";

import { useRef } from "react";
import { motion, useMotionTemplate, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";
import { brand } from "@/lib/brand";
import { Logo } from "./navbar";

const orbs = [
  { color: brand.accent, size: 220, x: "8%", y: "18%", speed: -120 },
  { color: brand.line, size: 160, x: "78%", y: "10%", speed: 90 },
  { color: brand.accentDeep, size: 120, x: "70%", y: "65%", speed: -60 },
  { color: brand.accentLight, size: 90, x: "20%", y: "72%", speed: 140 },
];

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  // A narrow arch that opens up into the full panel as it scrolls into view.
  const side = useTransform(scrollYProgress, [0, 0.45], [22, 0]);
  const top = useTransform(scrollYProgress, [0, 0.45], [8, 0]);
  const arch = useTransform(scrollYProgress, [0, 0.45], [600, 40]);
  const clipPath = useMotionTemplate`inset(${top}% ${side}% 0% ${side}% round ${arch}px ${arch}px 40px 40px)`;

  return (
    <section ref={ref} className="px-4 pb-10 sm:px-6">
      <motion.div
        style={{ clipPath }}
        className="relative mx-auto max-w-6xl overflow-hidden bg-ink px-6 py-24 text-center sm:py-32"
      >
        {orbs.map((o) => (
          <Orb key={o.color} {...o} progress={scrollYProgress} />
        ))}
        <div className="relative">
          <Reveal>
            <h2 className="mx-auto max-w-3xl font-display text-5xl leading-[1.05] text-paper sm:text-6xl lg:text-7xl">
              Siap kenalan dengan <em className="text-accent-light">palet warnamu</em>?
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mx-auto mt-6 max-w-lg text-lg text-paper/75">
              Satu token, tiga hasil, satu laporan privat. Mulai dari Rp19.000.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <Magnetic className="mt-10">
              <a
                href="#harga"
                className="group inline-flex items-center gap-2 rounded-full bg-paper px-8 py-4 text-sm font-medium text-ink transition-colors hover:bg-accent-soft"
              >
                Mulai Analisis
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </a>
            </Magnetic>
          </Reveal>
        </div>
      </motion.div>
    </section>
  );
}

function Orb({
  color,
  size,
  x,
  y,
  speed,
  progress,
}: (typeof orbs)[number] & { progress: ReturnType<typeof useScroll>["scrollYProgress"] }) {
  const translate = useTransform(progress, [0, 1], [0, speed]);
  return (
    <motion.span
      style={{ y: translate, left: x, top: y, width: size, height: size, background: color }}
      className="pointer-events-none absolute rounded-full opacity-40 blur-2xl"
    />
  );
}

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-8 border-t border-line pt-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            AI personal color, body shape & virtual try-on untuk pengguna Indonesia. Semua hasil
            bersifat estimasi dan saran gaya.
          </p>
        </div>
        <div className="flex gap-16 text-sm">
          <ul className="space-y-3 text-muted">
            <li><a href="#cara-kerja" className="hover:text-ink">Cara Kerja</a></li>
            <li><a href="#hasil" className="hover:text-ink">Contoh Hasil</a></li>
            <li><a href="#harga" className="hover:text-ink">Harga</a></li>
          </ul>
          <ul className="space-y-3 text-muted">
            <li><a href="#privasi" className="hover:text-ink">Privasi</a></li>
            <li><a href="#faq" className="hover:text-ink">FAQ</a></li>
          </ul>
        </div>
      </div>
      <p className="mt-10 text-xs text-muted">© 2026 FLICKS Lite. Hak cipta dilindungi.</p>
    </footer>
  );
}
