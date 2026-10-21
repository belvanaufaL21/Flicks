"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { Camera, FileText, QrCode, Shirt, Sparkles } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { brand } from "@/lib/brand";

// Every step gets its own silhouette so the row reads like a lookbook, not a grid.
const steps = [
  {
    icon: QrCode,
    title: "Beli satu token",
    body: "Bayar Rp19.000 via QRIS. Token baru diterbitkan setelah pembayaran terverifikasi di server — bukan dari browser.",
    shape: "rounded-t-full",
    tone: "bg-ink text-accent-light",
  },
  {
    icon: Camera,
    title: "Upload foto sesuai panduan",
    body: "Ikuti panduan foto singkat, centang persetujuan privasi, lalu upload. Foto dicek kelayakannya dulu sebelum diproses AI.",
    shape: "rounded-full",
    tone: "bg-accent-soft text-accent-deep",
  },
  {
    icon: Sparkles,
    title: "AI membaca warna & bentuk tubuh",
    body: "Sistem memperkirakan personal color dan body shape-mu, lengkap dengan tingkat keyakinan. Foto kurang jelas? Hasilnya ditandai tidak konklusif.",
    shape: "rounded-[44%_56%_48%_52%/58%_44%_56%_42%]",
    tone: "bg-accent-deep text-paper",
  },
  {
    icon: Shirt,
    title: "Coba satu outfit secara virtual",
    body: "Pilih satu produk dari katalog dan lihat simulasi virtual try-on dari foto kamu sendiri.",
    shape: "rounded-tl-[9rem] rounded-br-[9rem] rounded-tr-2xl rounded-bl-2xl",
    tone: "bg-line text-ink",
  },
  {
    icon: FileText,
    title: "Buka laporan privatmu",
    body: "Semua hasil dirangkum dalam satu laporan di tautan rahasia yang aktif selama 72 jam. Setelah itu, akses otomatis ditutup.",
    shape: "rounded-b-full rounded-t-3xl",
    tone: "bg-accent text-paper",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  // How far the track must travel so its last panel ends at the viewport edge.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setDistance(Math.max(0, track.scrollWidth - window.innerWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const x = useTransform(smooth, (v) => -v * distance);
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(steps.length - 1, Math.floor(v * steps.length)));
  });

  return (
    <section
      id="cara-kerja"
      ref={sectionRef}
      style={{ height: `calc(100svh + ${distance}px)` }}
      className="relative"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden py-12">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-6 px-4 sm:px-6">
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

        <motion.div
          ref={trackRef}
          style={{ x }}
          className="relative mt-10 flex w-max gap-8 px-4 sm:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:gap-14"
        >
          {/* Thread that runs behind the shapes */}
          <svg
            className="pointer-events-none absolute left-0 top-[18vh] h-24 w-full"
            preserveAspectRatio="none"
            viewBox="0 0 1000 100"
            aria-hidden="true"
          >
            <motion.path
              d="M0 50 C 100 0, 150 100, 250 50 S 400 0, 500 50 S 650 100, 750 50 S 900 0, 1000 50"
              fill="none"
              stroke={brand.accent}
              strokeOpacity="0.45"
              strokeWidth="1.5"
              style={{ pathLength: smooth }}
            />
          </svg>

          {steps.map(({ icon: Icon, title, body, shape, tone }, i) => (
            <motion.article
              key={title}
              initial={{ opacity: 0.35, scale: 0.88 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ amount: 0.7 }}
              transition={{ duration: 0.6, ease: easeOut }}
              className="relative w-[78vw] shrink-0 sm:w-[340px] lg:w-[360px]"
            >
              <div
                className={`relative flex h-[30vh] max-h-[300px] min-h-[160px] items-center justify-center overflow-hidden ${shape} ${tone}`}
              >
                <span className="absolute -bottom-6 -right-2 font-display text-[9rem] leading-none opacity-15">
                  0{i + 1}
                </span>
                <motion.span
                  initial={{ rotate: -25, scale: 0.6 }}
                  whileInView={{ rotate: 0, scale: 1 }}
                  viewport={{ amount: 0.7 }}
                  transition={{ type: "spring", stiffness: 160, damping: 12 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full border border-current/30"
                >
                  <Icon size={30} />
                </motion.span>
              </div>
              <p className="mt-6 font-display text-sm text-accent-deep">Langkah 0{i + 1}</p>
              <h3 className="mt-1 font-display text-2xl text-ink sm:text-3xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
            </motion.article>
          ))}
        </motion.div>

        <div className="mx-auto mt-10 w-full max-w-6xl px-4 sm:px-6">
          <div className="h-px bg-line">
            <motion.div style={{ scaleX: smooth }} className="h-px origin-left bg-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}
