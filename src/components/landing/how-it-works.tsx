"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  transform,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { easeOut } from "@/components/motion/reveal";
import { brand } from "@/lib/brand";
import { AnalyzeDemo, DemoPhone, PayDemo, ReportDemo, TryOnDemo, UploadDemo } from "./step-demos";

const steps = [
  {
    demo: PayDemo,
    title: "Beli satu token",
    body: "Bayar Rp19.000 via QRIS. Token baru diterbitkan setelah pembayaran terverifikasi di server — bukan dari browser.",
    shape: "rounded-t-full",
    tone: "bg-accent-soft",
  },
  {
    demo: UploadDemo,
    title: "Upload foto sesuai panduan",
    body: "Ikuti panduan foto singkat, centang persetujuan privasi, lalu upload. Foto dicek kelayakannya dulu sebelum diproses AI.",
    shape: "rounded-full",
    tone: "bg-line/70",
  },
  {
    demo: AnalyzeDemo,
    title: "AI membaca warna & bentuk tubuh",
    body: "Sistem memperkirakan personal color dan body shape-mu, lengkap dengan tingkat keyakinan. Foto kurang jelas? Hasilnya ditandai tidak konklusif.",
    shape: "rounded-[44%_56%_48%_52%/58%_44%_56%_42%]",
    tone: "bg-accent/30",
  },
  {
    demo: TryOnDemo,
    title: "Coba satu outfit secara virtual",
    body: "Pilih satu produk dari katalog dan lihat simulasi virtual try-on dari foto kamu sendiri.",
    shape: "rounded-tl-[10rem] rounded-br-[10rem] rounded-tr-3xl rounded-bl-3xl",
    tone: "bg-accent-soft",
  },
  {
    demo: ReportDemo,
    title: "Buka laporan privatmu",
    body: "Semua hasil dirangkum dalam satu laporan di tautan rahasia yang aktif selama 72 jam. Setelah itu, akses otomatis ditutup.",
    shape: "rounded-b-full rounded-t-[3rem]",
    tone: "bg-line/70",
  },
];

// Share of each step's scroll segment spent holding still, so its demo can be watched.
const HOLD = 0.5;

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const toX = useRef<(v: number) => number>(() => 0);

  // Maps scroll progress to track position: each panel is centered and held for part
  // of its segment, then the track glides to the next one.
  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const seg = 1 / (steps.length - 1);
      const input: number[] = [];
      const output: number[] = [];
      panelRefs.current.forEach((panel, i) => {
        if (!panel) return;
        const center = panel.offsetLeft - (vw - panel.offsetWidth) / 2;
        const mid = i * seg;
        input.push(Math.max(0, mid - (seg * HOLD) / 2), Math.min(1, mid + (seg * HOLD) / 2));
        output.push(-center, -center);
      });
      toX.current = transform(input, output);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const x = useTransform(smooth, (v) => toX.current(v));
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.round(v * (steps.length - 1)));
  });

  return (
    <section
      id="cara-kerja"
      ref={sectionRef}
      style={{ height: `${100 + (steps.length - 1) * 110}svh` }}
      className="relative"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">Cara kerja</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Lima langkah, <em className="text-accent">satu laporan</em>.
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {steps.map((s, i) => (
              <motion.span
                key={s.title}
                animate={{
                  width: i === active ? 36 : 10,
                  backgroundColor: i <= active ? brand.accent : brand.line,
                }}
                transition={{ duration: 0.4, ease: easeOut }}
                className="h-2.5 rounded-full"
              />
            ))}
            <span className="ml-1 font-display text-lg text-muted">
              0{active + 1} / 0{steps.length}
            </span>
          </div>
        </div>

        <motion.div style={{ x }} className="mt-6 flex w-max gap-[18vw] px-[7vw] lg:mt-10">
          {steps.map(({ demo: Demo, title, body, shape, tone }, i) => {
            const isActive = i === active;
            return (
              <motion.article
                key={title}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
                animate={{ opacity: isActive ? 1 : 0.35, scale: isActive ? 1 : 0.92 }}
                transition={{ duration: 0.6, ease: easeOut }}
                className="flex w-[86vw] shrink-0 flex-col items-center gap-5 lg:w-[min(64rem,86vw)] lg:flex-row lg:gap-16"
              >
                {/* Demo: phone in front of a soft shaped backdrop */}
                <div className="relative flex shrink-0 items-center justify-center lg:order-2 lg:w-[30rem]">
                  <motion.div
                    animate={{ rotate: isActive ? 0 : -8, scale: isActive ? 1 : 0.85 }}
                    transition={{ duration: 0.9, ease: easeOut }}
                    className={`absolute h-[88%] w-[92%] lg:w-full ${shape} ${tone}`}
                  />
                  <DemoPhone>
                    <Demo key={isActive ? "on" : "off"} active={isActive} />
                  </DemoPhone>
                </div>

                <div className="w-full max-w-md lg:order-1 lg:flex-1">
                  <p className="font-display text-5xl text-accent lg:text-7xl">0{i + 1}</p>
                  <h3 className="mt-1 font-display text-2xl text-ink sm:text-3xl lg:mt-3 lg:text-4xl">{title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted sm:line-clamp-none sm:text-base lg:mt-4">
                    {body}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>

        <div className="mx-auto mt-6 w-full max-w-6xl px-4 sm:px-6 lg:mt-10">
          <div className="h-px bg-line">
            <motion.div style={{ scaleX: smooth }} className="h-px origin-left bg-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}
