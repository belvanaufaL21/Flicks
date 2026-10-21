"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";
import { Logo } from "./navbar";

// The sample model's Deep Autumn palette (see report-preview.tsx), ordered light to deep.
const swatches = [
  { name: "Ivory hangat", hex: "#EFE4CF", light: true },
  { name: "Camel", hex: "#B0875A", light: true },
  { name: "Mustard", hex: "#C08A2B", light: true },
  { name: "Rust", hex: "#9C4A2F" },
  { name: "Burgundy", hex: "#6E2A2F" },
  { name: "Cokelat tua", hex: "#4E3426" },
  { name: "Olive", hex: "#6B6B2E" },
  { name: "Hijau hutan", hex: "#2F4A34" },
  { name: "Teal gelap", hex: "#1F5A5A" },
];
const SPREAD = 11; // degrees between neighbouring cards when the fan is fully open

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  // A narrow arch that opens up into the full panel as it scrolls into view.
  const side = useTransform(scrollYProgress, [0, 0.45], [22, 0]);
  const top = useTransform(scrollYProgress, [0, 0.45], [8, 0]);
  const arch = useTransform(scrollYProgress, [0, 0.45], [600, 40]);
  const clipPath = useMotionTemplate`inset(${top}% ${side}% 0% ${side}% round ${arch}px ${arch}px 40px 40px)`;
  // The swatch fan opens as the arch does, then keeps drifting slightly.
  const open = useTransform(scrollYProgress, [0.12, 0.5], [0, 1], { clamp: true });
  const fanY = useTransform(scrollYProgress, [0.12, 0.5, 1], [120, 0, -30]);

  // Warm spotlight that follows the pointer across the panel.
  const mx = useMotionValue(560);
  const my = useMotionValue(220);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${mx}px ${my}px, rgba(201,179,143,0.18), transparent 65%)`;

  return (
    <section ref={ref} className="px-4 pb-10 sm:px-6">
      <motion.div
        style={{ clipPath }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mx.set(e.clientX - rect.left);
          my.set(e.clientY - rect.top);
        }}
        className="relative mx-auto max-w-6xl overflow-hidden bg-ink px-6 pb-[300px] pt-24 text-center sm:pb-[400px] sm:pt-28"
      >
        {/* Depth: a soft top light, the pointer spotlight, and a floor glow behind the fan */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_0%,rgba(154,128,96,0.22),transparent)]" />
        <motion.div style={{ background: spotlight }} className="pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_60%_70%_at_50%_100%,rgba(201,179,143,0.16),transparent)]" />

        <motion.div
          style={{ y: fanY }}
          className="pointer-events-none absolute bottom-[-60px] left-1/2 h-[440px] w-0 origin-bottom scale-[0.68] sm:scale-100"
          aria-hidden="true"
        >
          {swatches.map((s, i) => (
            <FanCard key={s.hex} swatch={s} index={i} open={open} />
          ))}
          {/* Rivet holding the fan together */}
          <span className="absolute bottom-[34px] left-0 z-20 h-6 w-6 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#d9c7a8] to-[#7a6447] shadow-[0_2px_6px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.6)]" />
        </motion.div>

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

// One card of the swatch fan; it pivots on the rivet near its base.
function FanCard({
  swatch,
  index,
  open,
}: {
  swatch: (typeof swatches)[number];
  index: number;
  open: MotionValue<number>;
}) {
  const angle = (index - (swatches.length - 1) / 2) * SPREAD;
  // Closed, the cards sit almost stacked with a tiny offset so the deck reads as layered.
  const rotate = useTransform(open, [0, 1], [angle * 0.08, angle]);

  return (
    <motion.div
      style={{ rotate, zIndex: index }}
      className="absolute bottom-0 left-[-46px] h-[440px] w-[92px] origin-[50%_92%] rounded-[18px] shadow-[0_24px_40px_-18px_rgba(0,0,0,0.85)]"
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-[18px] ring-1 ring-black/10"
        style={{ background: swatch.hex }}
      >
        {/* Paper sheen and a darker spine edge so each card reads as a physical swatch */}
        <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.22)_0%,transparent_22%,rgba(255,255,255,0.1)_58%,transparent_80%)]" />
        <span className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent" />
        {/* Label sits on the left: the next card overlaps each card's right edge */}
        <span
          className={`absolute left-3 top-4 flex max-w-[60px] flex-col items-start gap-0.5 text-left ${
            swatch.light ? "text-ink/80" : "text-paper/85"
          }`}
        >
          <span className="font-display text-[15px] leading-[1.1]">{swatch.name}</span>
          <span className="font-mono text-[9px] tracking-wider opacity-80">{swatch.hex}</span>
        </span>
        <span
          className={`absolute bottom-[26px] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full ${
            swatch.light ? "bg-ink/15" : "bg-black/30"
          }`}
        />
      </div>
    </motion.div>
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
