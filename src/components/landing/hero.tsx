"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, ScanLine } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";

const headline = ["Temukan", "warna", "&", "siluet", "yang", "paling"];
const palette = ["#b5835a", "#8a9a5b", "#a26769", "#d4a373", "#6b7f6a"];

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
        className="pointer-events-none absolute -top-40 right-[-20%] h-[640px] w-[640px] rounded-full bg-gradient-to-br from-accent/25 via-line/60 to-transparent blur-3xl"
      />
      <motion.div
        style={{ scale: blobScale }}
        className="pointer-events-none absolute bottom-[-30%] left-[-15%] h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-line/70 via-accent-soft/60 to-transparent blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div style={{ y: textY, opacity: textOpacity }}>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: easeOut }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-paper/70 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            AI Personal Styling · Soft launch
          </motion.p>

          <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            {headline.map((word, i) => (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.9, ease: easeOut, delay: 0.15 + i * 0.07 }}
                  className="inline-block pr-[0.25em]"
                >
                  {word}
                </motion.span>
              </span>
            ))}
            <span className="inline-block overflow-hidden pb-1 align-bottom">
              <motion.span
                initial={{ y: "110%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 0.9, ease: easeOut, delay: 0.15 + headline.length * 0.07 }}
                className="inline-block italic text-accent"
              >
                kamu.
              </motion.span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOut, delay: 0.75 }}
            className="mt-6 max-w-lg text-lg leading-relaxed text-muted"
          >
            Estimasi personal color, analisis body shape, dan virtual try-on berbasis AI — semuanya
            dalam satu paket <strong className="font-semibold text-ink">Rp19.000</strong>. Tanpa
            akun, tanpa langganan.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOut, delay: 0.9 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Magnetic>
              <a
                href="#harga"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper shadow-lg shadow-ink/20 transition-colors hover:bg-accent-deep"
              >
                Mulai Analisis
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </a>
            </Magnetic>
            <a
              href="#cara-kerja"
              className="rounded-full border border-ink/15 px-7 py-4 text-sm font-medium text-ink transition-colors hover:border-ink/40"
            >
              Lihat cara kerja
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.1 }}
            className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
          >
            <li>✦ Bayar via QRIS</li>
            <li>✦ Laporan privat 72 jam</li>
            <li>✦ Hasil berupa estimasi</li>
          </motion.ul>
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

                <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-2xl bg-paper/90 px-3 py-2.5 text-xs text-ink backdrop-blur">
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
              <p className="mt-1 font-display text-xl text-ink">Soft Autumn</p>
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
              <p className="text-[11px] text-muted">Keyakinan: sedang</p>
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
        className="rounded-2xl border border-line/70 bg-paper/85 px-4 py-3 shadow-[0_20px_40px_-20px_rgba(37,34,31,0.35)] backdrop-blur-md"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
