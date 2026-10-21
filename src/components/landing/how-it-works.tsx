"use client";

import { useEffect, useRef, useState } from "react";
import {
  easeInOut,
  motion,
  transform,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { easeOut } from "@/components/motion/reveal";
import { brand } from "@/lib/brand";
import {
  AnalyzeCallouts,
  AnalyzeDemo,
  DemoPhone,
  PayCallouts,
  PayDemo,
  ReportCallouts,
  ReportDemo,
  TryOnCallouts,
  TryOnDemo,
  UploadCallouts,
  UploadDemo,
} from "./step-demos";

const steps = [
  {
    demo: PayDemo,
    callouts: PayCallouts,
    title: "Beli satu token",
    body: "Bayar Rp19.000 via QRIS. Token baru diterbitkan setelah pembayaran terverifikasi di server — bukan dari browser.",
    shape: "rounded-t-full",
    tone: "bg-accent-soft",
  },
  {
    demo: UploadDemo,
    callouts: UploadCallouts,
    title: "Upload foto sesuai panduan",
    body: "Ikuti panduan foto singkat, centang persetujuan privasi, lalu upload. Foto dicek kelayakannya dulu sebelum diproses AI.",
    shape: "rounded-full",
    tone: "bg-line/70",
  },
  {
    demo: AnalyzeDemo,
    callouts: AnalyzeCallouts,
    title: "AI membaca warna & bentuk tubuh",
    body: "Sistem memperkirakan personal color dan body shape-mu, lengkap dengan tingkat keyakinan. Foto kurang jelas? Hasilnya ditandai tidak konklusif.",
    shape: "rounded-[44%_56%_48%_52%/58%_44%_56%_42%]",
    tone: "bg-accent/30",
  },
  {
    demo: TryOnDemo,
    callouts: TryOnCallouts,
    title: "Coba satu outfit secara virtual",
    body: "Pilih satu produk dari katalog dan lihat simulasi virtual try-on dari foto kamu sendiri.",
    shape: "rounded-tl-[10rem] rounded-br-[10rem] rounded-tr-3xl rounded-bl-3xl",
    tone: "bg-accent-soft",
  },
  {
    demo: ReportDemo,
    callouts: ReportCallouts,
    title: "Buka laporan privatmu",
    body: "Semua hasil dirangkum dalam satu laporan di tautan rahasia yang aktif selama 72 jam. Setelah itu, akses otomatis ditutup.",
    shape: "rounded-b-full rounded-t-[3rem]",
    tone: "bg-line/70",
  },
];

const SEGMENT = 1 / (steps.length - 1);
// Share of each step's scroll segment spent holding still, so its demo can be watched.
const HOLD = 0.55;
// Scroll distance per step, in viewport heights. Higher = slower horizontal travel.
const SCROLL_PER_STEP = 1.7;

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const toX = useRef<(v: number) => number>(() => 0);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  // The track padding already centers the first panel in CSS, so x starts at 0 with no jump.
  const x = useMotionValue(0);
  const [active, setActive] = useState(0);

  // Maps scroll progress to track position: each panel is centered and held for part of
  // its segment, then the track eases to the next one.
  useEffect(() => {
    const measure = () => {
      const vw = document.documentElement.clientWidth;
      const input: number[] = [];
      const output: number[] = [];
      panelRefs.current.forEach((panel, i) => {
        if (!panel) return;
        const center = panel.offsetLeft - (vw - panel.offsetWidth) / 2;
        const mid = i * SEGMENT;
        input.push(Math.max(0, mid - (SEGMENT * HOLD) / 2), Math.min(1, mid + (SEGMENT * HOLD) / 2));
        output.push(-center, -center);
      });
      toX.current = transform(input, output, { ease: easeInOut });
      // Apply immediately instead of waiting for the next scroll event.
      x.set(toX.current(scrollYProgress.get()));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [x, scrollYProgress]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    x.set(toX.current(v));
    setActive(Math.round(v * (steps.length - 1)));
  });

  return (
    <section
      id="cara-kerja"
      ref={sectionRef}
      style={{ height: `${100 + (steps.length - 1) * SCROLL_PER_STEP * 100}svh` }}
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

        {/* Side padding = (viewport − panel width) / 2, so the first and last panels center exactly */}
        <motion.div
          style={{ x }}
          className="mt-6 flex w-max gap-[18vw] px-[7vw] will-change-transform lg:mt-10 lg:px-[calc((100vw-min(64rem,86vw))/2)]"
        >
          {steps.map((step, i) => (
            <StepPanel
              key={step.title}
              step={step}
              index={i}
              active={i === active}
              progress={scrollYProgress}
              panelRef={(el) => {
                panelRefs.current[i] = el;
              }}
            />
          ))}
        </motion.div>

        <div className="mx-auto mt-6 w-full max-w-6xl px-4 sm:px-6 lg:mt-10">
          <div className="h-px bg-line">
            <motion.div style={{ scaleX: scrollYProgress }} className="h-px origin-left bg-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepPanel({
  step: { demo: Demo, callouts: Callouts, title, body, shape, tone },
  index,
  active,
  progress,
  panelRef,
}: {
  step: (typeof steps)[number];
  index: number;
  active: boolean;
  progress: MotionValue<number>;
  panelRef: (el: HTMLElement | null) => void;
}) {
  // 0 when this panel is centered, 1 a full segment away: drives a continuous
  // fade, scale and backdrop tilt instead of a hard switch.
  const signed = useTransform(progress, (v) => Math.max(-1, Math.min(1, (v - index * SEGMENT) / SEGMENT)));
  const distance = useTransform(signed, Math.abs);
  // Coverflow-style turn: the phone faces the center as it slides in and out.
  const phoneRotateY = useTransform(signed, [-1, 0, 1], [-24, 0, 24]);
  const opacity = useTransform(distance, [0, 0.25, 1], [1, 1, 0.3]);
  const scale = useTransform(distance, [0, 0.25, 1], [1, 1, 0.9]);
  const backdropRotate = useTransform(distance, [0, 1], [0, -10]);
  const backdropScale = useTransform(distance, [0, 1], [1, 0.82]);
  const textY = useTransform(distance, [0, 1], [0, 40]);

  return (
    <motion.article
      ref={panelRef}
      style={{ opacity, scale }}
      className="flex w-[86vw] shrink-0 flex-col items-center gap-5 lg:w-[min(64rem,86vw)] lg:flex-row lg:gap-16"
    >
      {/* Demo: phone in front of a soft shaped backdrop */}
      <div className="relative flex shrink-0 items-center justify-center lg:order-2 lg:w-[30rem]">
        <motion.div
          style={{ rotate: backdropRotate, scale: backdropScale }}
          className={`absolute h-[88%] w-[92%] overflow-hidden lg:w-full ${shape} ${tone}`}
        >
          {/* Inner rings and a soft light give the flat shape some depth */}
          <span className="absolute inset-[12%] rounded-[inherit] border border-paper/50" />
          <span className="absolute inset-[24%] rounded-[inherit] border border-paper/30" />
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_55%)]" />
        </motion.div>
        <motion.div style={{ rotateY: phoneRotateY, transformPerspective: 1100 }}>
          <DemoPhone callouts={<Callouts active={active} />}>
            <Demo key={active ? "on" : "off"} active={active} />
          </DemoPhone>
        </motion.div>
      </div>

      <motion.div style={{ y: textY }} className="w-full max-w-md lg:order-1 lg:flex-1">
        <p className="font-display text-5xl text-accent lg:text-7xl">0{index + 1}</p>
        <h3 className="mt-1 font-display text-2xl text-ink sm:text-3xl lg:mt-3 lg:text-4xl">{title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted sm:line-clamp-none sm:text-base lg:mt-4">
          {body}
        </p>
      </motion.div>
    </motion.article>
  );
}
