"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, ScanLine } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";

const headline = [
  { text: "Kenali warnamu." },
  { text: "Pahami siluetmu." },
  { text: "Coba sebelum beli.", accent: true },
];
const facts = [
  ["Rp19rb", "sekali bayar"],
  ["72 jam", "laporan privat"],
  ["QRIS", "tanpa akun"],
];
// Top of the Deep Autumn palette measured for the sample model (see report-preview.tsx).
const palette = ["#9c4a2f", "#6b6b2e", "#4e3426", "#1f5a5a", "#6e2a2f"];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Layers drift at different speeds as the hero scrolls away.
  const textY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const phoneRotate = useTransform(scrollYProgress, [0, 1], [0, -4]);
  const cardFastY = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const cardSlowY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const blobScale = useTransform(scrollYProgress, [0, 1], [1, 1.35]);
  const archY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const outlineY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  // Pointer position (-0.5…0.5) drives a gentle 3D tilt of the phone.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const tiltY = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 18 });
  const tiltX = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });

  return (
    <section
      ref={ref}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width - 0.5);
        py.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className="relative overflow-hidden pt-32 pb-24 sm:pt-40 lg:pb-32"
    >
      <motion.div
        style={{ scale: blobScale }}
        className="pointer-events-none absolute -top-40 right-[-20%] h-[640px] w-[640px] bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-accent)_26%,transparent)_0%,color-mix(in_srgb,var(--color-line)_45%,transparent)_40%,transparent_70%)]"
      />
      <motion.div
        style={{ scale: blobScale }}
        className="pointer-events-none absolute bottom-[-30%] left-[-15%] h-[520px] w-[520px] bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-line)_70%,transparent)_0%,color-mix(in_srgb,var(--color-accent-soft)_50%,transparent)_40%,transparent_70%)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div style={{ y: textY, opacity: textOpacity }}>
          {/* Issue-style masthead line instead of a pill badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted"
          >
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, ease: easeOut }}
              className="h-px w-10 origin-left bg-ink/50"
            />
            <span className="hidden sm:inline">Personal styling · </span>Edisi soft launch
          </motion.div>

          {/* One line per thing the report gives you, numbered like an index */}
          <h1 className="mt-8 font-display text-[2.85rem] leading-[1.02] tracking-tight text-ink sm:text-6xl lg:text-[4.1rem] xl:text-7xl">
            {headline.map((line, i) => (
              <span key={line.text} className="flex items-start gap-4 sm:gap-5">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.35 + i * 0.12 }}
                  className="mt-[0.55em] w-6 shrink-0 font-sans text-xs font-semibold tabular-nums tracking-wider text-accent-deep"
                >
                  0{i + 1}
                </motion.span>
                <span className="block overflow-hidden pb-[0.08em]">
                  <motion.span
                    initial={{ y: "105%" }}
                    animate={{ y: "0%" }}
                    transition={{ duration: 0.95, ease: easeOut, delay: 0.2 + i * 0.12 }}
                    className={`block whitespace-nowrap ${line.accent ? "italic text-accent" : ""}`}
                  >
                    {line.text}
                  </motion.span>
                </span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOut, delay: 0.7 }}
            className="mt-8 max-w-md pl-10 text-lg leading-relaxed text-muted sm:pl-11"
          >
            Upload satu foto. Kamu dapat estimasi personal color, body shape, dan satu simulasi
            virtual try-on dalam satu laporan privat.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOut, delay: 0.85 }}
            className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4 pl-10 sm:pl-11"
          >
            <Magnetic>
              <a
                href="#harga"
                className="group inline-flex items-center gap-3 rounded-full bg-ink py-2 pl-6 pr-2 text-sm font-medium text-paper shadow-lg shadow-ink/20 transition-colors hover:bg-accent-deep"
              >
                Mulai analisis
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink transition-transform group-hover:translate-x-0.5">
                  <ArrowRight size={15} />
                </span>
              </a>
            </Magnetic>
            <a
              href="#cara-kerja"
              className="group text-sm font-medium text-ink underline decoration-ink/25 underline-offset-[6px] transition-colors hover:decoration-ink"
            >
              Lihat cara kerjanya
            </a>
          </motion.div>

          {/* Plain facts, set like a spec row */}
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.05 }}
            className="mt-12 grid max-w-md grid-cols-3 divide-x divide-line border-t border-line pt-5 sm:ml-11"
          >
            {facts.map(([value, label]) => (
              <div key={label} className="px-4 first:pl-0">
                <dt className="font-display text-2xl text-ink">{value}</dt>
                <dd className="mt-0.5 text-xs text-muted">{label}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        {/* Phone mockup */}
        <div className="relative mx-auto w-full max-w-[420px]">
          {/* Arch backdrop: filled arch plus an offset outline, drifting apart on scroll */}
          <motion.div
            style={{ y: archY }}
            initial={{ opacity: 0, scaleY: 0.6 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 1.3, ease: easeOut, delay: 0.1 }}
            className="absolute inset-x-6 -bottom-6 top-10 origin-bottom rounded-t-full bg-gradient-to-b from-accent-soft to-line/70 sm:inset-x-10"
          />
          <motion.div
            style={{ y: outlineY }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.5 }}
            className="absolute inset-x-2 -bottom-2 top-2 translate-x-4 rounded-t-full border border-accent/50 sm:inset-x-6"
          />
          {/* Hang tag with the package price, swaying from a short string */}
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: easeOut, delay: 1.2 }}
            className="absolute -bottom-6 right-3 z-10 sm:right-0"
          >
            <motion.div
              animate={{ rotate: [-5, 3] }}
              transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
              style={{ transformOrigin: "50% -28px" }}
              className="relative w-28 rounded-t-[3.5rem] rounded-b-2xl bg-ink px-4 pb-4 pt-9 text-center text-paper shadow-[0_24px_40px_-16px_rgba(37,34,31,0.6)]"
            >
              <span className="absolute -top-7 left-1/2 h-10 w-px -translate-x-1/2 bg-ink/40" />
              <span className="absolute left-1/2 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cream ring-1 ring-accent/40" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-light">1 token</p>
              <p className="mt-1 font-display text-3xl leading-none">Rp19rb</p>
              <div className="my-3 border-t border-dashed border-paper/20" />
              <p className="text-[11px] leading-snug text-paper/70">
                3 hasil
                <br />
                sekali bayar
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            style={{ y: phoneY, rotate: phoneRotate, rotateX: tiltX, rotateY: tiltY, transformPerspective: 1000 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 60, rotate: 6 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 1.2, ease: easeOut, delay: 0.3 }}
              className="relative mx-auto h-[540px] w-[270px] rounded-[46px] bg-ink p-3 shadow-[0_40px_80px_-30px_rgba(37,34,31,0.6)]"
            >
              <div className="absolute left-1/2 top-5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-ink" />
              <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-[#e3cfb3]">
                {/* Photo stops above the status pill so the shoes stay visible */}
                <div className="absolute inset-x-0 top-0 bottom-12">
                  <Image
                    src="/images/model-before.webp"
                    alt="Contoh foto pengguna berdiri menghadap kamera"
                    fill
                    priority
                    sizes="246px"
                    className="object-cover object-top"
                  />
                </div>

                {/* corner brackets */}
                {[
                  "left-5 top-14 border-l-2 border-t-2",
                  "right-5 top-14 border-r-2 border-t-2",
                  "left-5 bottom-16 border-b-2 border-l-2",
                  "right-5 bottom-16 border-b-2 border-r-2",
                ].map((pos) => (
                  <span key={pos} className={`absolute h-6 w-6 rounded-sm border-accent/70 ${pos}`} />
                ))}

                {/* scan line */}
                <motion.div
                  animate={{ top: ["14%", "80%", "14%"] }}
                  transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
                  className="absolute inset-x-5 h-0.5 rounded-full bg-accent shadow-[0_0_24px_6px_rgba(154,128,96,0.45)]"
                />

                <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-2xl bg-paper/95 px-3 py-2.5 text-xs text-ink">
                  <ScanLine size={14} className="text-accent-deep" />
                  <span className="font-medium">Menganalisis foto</span>
                  <span className="ml-auto flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }}
                        className="h-1.5 w-1.5 rounded-full bg-accent"
                      />
                    ))}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Floating result cards */}
          <motion.div style={{ y: cardFastY }} className="absolute -left-2 top-16 sm:-left-10">
            <FloatCard delay={1.1}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Personal Color
              </p>
              <p className="mt-1 font-display text-xl text-ink">Deep Autumn</p>
              <div className="mt-2 flex gap-1">
                {palette.map((c) => (
                  <span key={c} className="h-4 w-4 rounded-full ring-2 ring-paper" style={{ background: c }} />
                ))}
              </div>
            </FloatCard>
          </motion.div>

          <motion.div style={{ y: cardSlowY }} className="absolute -right-2 top-[45%] sm:-right-8">
            <FloatCard delay={1.3} float={-10}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Body Shape
              </p>
              <p className="mt-1 font-display text-xl text-ink">Hourglass</p>
              <p className="text-[11px] text-muted">Keyakinan: rendah</p>
            </FloatCard>
          </motion.div>

          <motion.div style={{ y: cardFastY }} className="absolute bottom-28 left-0 sm:-left-12">
            <FloatCard delay={1.5} float={8}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <p className="text-xs font-medium text-ink">Virtual try-on siap</p>
              </div>
            </FloatCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FloatCard({
  children,
  delay,
  float = -8,
}: {
  children: React.ReactNode;
  delay: number;
  float?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, ease: easeOut, delay }}
    >
      <motion.div
        animate={{ y: [0, float, 0] }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
        className="rounded-2xl border border-line/70 bg-paper/95 px-4 py-3 shadow-[0_20px_40px_-20px_rgba(37,34,31,0.35)]"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
