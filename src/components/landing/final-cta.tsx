"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";
import { Logo } from "./navbar";

type Edge = "left" | "right" | "top" | "bottom";

// The sample model's Deep Autumn palette (see report-preview.tsx), scattered around the
// headline. Each card has a resting spot (centre, in % of the panel), a tilt, the edge it
// flies in from, when it starts arriving, and how much it drifts with scroll afterwards.
const swatches: {
  name: string;
  hex: string;
  light?: boolean;
  left: number;
  top: number;
  rotate: number;
  from: Edge;
  start: number;
  depth: number;
  desktopOnly?: boolean;
  // Resting spot on small screens, pushed into the corners so the headline stays clear.
  mobile?: [number, number];
}[] = [
  { name: "Ivory hangat", mobile: [5, 15], hex: "#EFE4CF", light: true, left: 7, top: 24, rotate: -12, from: "left", start: 0.1, depth: 40 },
  { name: "Camel", mobile: [7, 93], hex: "#B0875A", light: true, left: 17, top: 62, rotate: 9, from: "left", start: 0.16, depth: 70 },
  { name: "Mustard", hex: "#C08A2B", light: true, left: 6, top: 88, rotate: -6, from: "bottom", start: 0.2, depth: 30, desktopOnly: true },
  { name: "Rust", hex: "#9C4A2F", left: 27, top: 7, rotate: -8, from: "top", start: 0.12, depth: 20, desktopOnly: true },
  { name: "Burgundy", hex: "#6E2A2F", left: 74, top: 6, rotate: 7, from: "top", start: 0.18, depth: 20, desktopOnly: true },
  { name: "Cokelat tua", mobile: [95, 16], hex: "#4E3426", left: 93, top: 26, rotate: 12, from: "right", start: 0.1, depth: 60 },
  { name: "Olive", mobile: [93, 91], hex: "#6B6B2E", left: 83, top: 62, rotate: -10, from: "right", start: 0.15, depth: 35 },
  { name: "Hijau hutan", hex: "#2F4A34", left: 95, top: 88, rotate: 6, from: "bottom", start: 0.22, depth: 50, desktopOnly: true },
  { name: "Teal gelap", hex: "#1F5A5A", left: 62, top: 97, rotate: 4, from: "bottom", start: 0.24, depth: 25, desktopOnly: true },
];

// Where a card starts before it flies in, relative to its resting spot.
const offsets: Record<Edge, { x: string; y: string; spin: number }> = {
  left: { x: "-60vw", y: "0vh", spin: -40 },
  right: { x: "60vw", y: "0vh", spin: 40 },
  top: { x: "0vw", y: "-70vh", spin: -25 },
  bottom: { x: "0vw", y: "70vh", spin: 25 },
};

const ARRIVAL = 0.3; // share of the section's scroll progress each card takes to land

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  // A narrow arch that opens up into the full-bleed panel as it scrolls into view.
  const side = useTransform(scrollYProgress, [0, 0.45], [22, 0]);
  const top = useTransform(scrollYProgress, [0, 0.45], [8, 0]);
  const arch = useTransform(scrollYProgress, [0, 0.45], [600, 0]);
  const clipPath = useMotionTemplate`inset(${top}% ${side}% 0% ${side}% round ${arch}px ${arch}px 0px 0px)`;

  // Warm spotlight that follows the pointer across the panel.
  const mx = useMotionValue(700);
  const my = useMotionValue(260);
  const spotlight = useMotionTemplate`radial-gradient(560px circle at ${mx}px ${my}px, rgba(201,179,143,0.18), transparent 65%)`;

  return (
    <section ref={ref} className="pb-10">
      <motion.div
        style={{ clipPath }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mx.set(e.clientX - rect.left);
          my.set(e.clientY - rect.top);
        }}
        className="relative flex min-h-[640px] items-center justify-center overflow-hidden bg-ink px-6 py-40 text-center sm:min-h-[720px]"
      >
        {/* Depth: a soft top light, the pointer spotlight, and a floor glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,rgba(154,128,96,0.22),transparent)]" />
        <motion.div style={{ background: spotlight }} className="pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_60%_70%_at_50%_100%,rgba(201,179,143,0.12),transparent)]" />

        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {swatches.map((s) => (
            <SwatchCard key={s.hex} swatch={s} progress={scrollYProgress} />
          ))}
        </div>

        <div className="relative z-10">
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
                className="group pointer-events-auto inline-flex items-center gap-2 rounded-full bg-paper px-8 py-4 text-sm font-medium text-ink transition-colors hover:bg-accent-soft"
              >
                Mulai analisis
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </a>
            </Magnetic>
          </Reveal>
        </div>
      </motion.div>
    </section>
  );
}

// One swatch card: flies in from its edge with a spin, lands at its spot, then drifts.
function SwatchCard({
  swatch: s,
  progress,
}: {
  swatch: (typeof swatches)[number];
  progress: MotionValue<number>;
}) {
  const from = offsets[s.from];
  const landed = useTransform(progress, [s.start, s.start + ARRIVAL], [0, 1], { clamp: true });
  const x = useTransform(landed, [0, 1], [from.x, "0vw"]);
  const y = useTransform(landed, [0, 1], [from.y, "0vh"]);
  const rotate = useTransform(landed, [0, 1], [s.rotate + from.spin, s.rotate]);
  const opacity = useTransform(landed, [0, 0.35, 1], [0, 1, 1]);
  // After landing, cards keep drifting at different speeds for a layered, parallax feel.
  const drift = useTransform(progress, [0.4, 1], [0, -s.depth]);

  return (
    <motion.div
      style={
        {
          "--l": `${s.left}%`,
          "--t": `${s.top}%`,
          "--ml": `${s.mobile?.[0] ?? s.left}%`,
          "--mt": `${s.mobile?.[1] ?? s.top}%`,
          x,
          y,
          rotate,
          opacity,
        } as MotionStyle
      }
      className={`absolute left-[var(--ml)] top-[var(--mt)] -ml-10 -mt-20 sm:-ml-12 sm:-mt-24 md:left-[var(--l)] md:top-[var(--t)] ${
        s.desktopOnly ? "hidden md:block" : ""
      }`}
    >
      <motion.div style={{ y: drift }}>
        <div
          className="relative h-40 w-20 overflow-hidden rounded-2xl shadow-[0_28px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-black/10 sm:h-48 sm:w-24"
          style={{ background: s.hex }}
        >
          {/* Paper sheen and a darker edge so each card reads as a physical swatch */}
          <span className="absolute inset-0 bg-[linear-gradient(100deg,rgba(0,0,0,0.2)_0%,transparent_24%,rgba(255,255,255,0.12)_60%,transparent_85%)]" />
          <span className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent" />
          {/* Cards hanging in from the top bleed off the top edge, so their label goes low */}
          <span
            className={`absolute left-2.5 flex flex-col items-start gap-0.5 text-left ${
              s.from === "top" ? "bottom-3" : "top-3"
            } ${s.light ? "text-ink/80" : "text-paper/85"}`}
          >
            <span className="font-display text-sm leading-[1.1] sm:text-[15px]">{s.name}</span>
            <span className="font-mono text-[9px] tracking-wider opacity-80">{s.hex}</span>
          </span>
          <span
            className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full ${
              s.from === "top" ? "top-3" : "bottom-3"
            } ${s.light ? "bg-ink/15" : "bg-black/30"}`}
          />
        </div>
      </motion.div>
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
