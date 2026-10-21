"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { Camera, FileText, QrCode, Shirt, Sparkles } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

const steps = [
  {
    icon: QrCode,
    title: "Beli satu token",
    body: "Bayar Rp19.000 via QRIS. Token baru diterbitkan setelah pembayaran terverifikasi di server — bukan dari browser.",
  },
  {
    icon: Camera,
    title: "Upload foto sesuai panduan",
    body: "Ikuti panduan foto singkat, centang persetujuan privasi, lalu upload. Foto dicek kelayakannya dulu sebelum diproses AI.",
  },
  {
    icon: Sparkles,
    title: "AI membaca warna & bentuk tubuh",
    body: "Sistem memperkirakan personal color dan body shape-mu, lengkap dengan tingkat keyakinan. Kalau foto kurang jelas, hasilnya ditandai tidak konklusif — bukan dipaksakan.",
  },
  {
    icon: Shirt,
    title: "Coba satu outfit secara virtual",
    body: "Pilih satu produk dari katalog dan lihat simulasi virtual try-on dari foto kamu sendiri.",
  },
  {
    icon: FileText,
    title: "Buka laporan privatmu",
    body: "Semua hasil dirangkum dalam satu laporan di tautan rahasia yang aktif selama 72 jam. Setelah itu, akses otomatis ditutup.",
  },
];

export function HowItWorks() {
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 65%", "end 55%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length))));
  });

  return (
    <section id="cara-kerja" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid gap-14 lg:grid-cols-[1fr_1.25fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading
            align="left"
            eyebrow="Cara kerja"
            title={
              <>
                Lima langkah, <em className="text-plum">satu laporan</em>.
              </>
            }
            description="Tanpa aplikasi, tanpa akun. Semua berjalan di browser HP atau laptopmu."
          />
          <div className="mt-10 hidden items-center gap-3 lg:flex">
            {steps.map((s, i) => (
              <motion.span
                key={s.title}
                animate={{
                  width: i === active ? 40 : 10,
                  backgroundColor: i <= active ? "#5a2941" : "#e7dccf",
                }}
                transition={{ duration: 0.4, ease: easeOut }}
                className="h-2.5 rounded-full"
              />
            ))}
            <span className="ml-2 font-display text-lg text-muted">
              0{active + 1} / 0{steps.length}
            </span>
          </div>
        </div>

        <ol ref={listRef} className="relative space-y-6 pl-10 sm:pl-14">
          <span className="absolute left-[15px] top-2 bottom-2 w-px bg-line sm:left-[23px]" />
          <motion.span
            style={{ scaleY: progress }}
            className="absolute left-[15px] top-2 bottom-2 w-px origin-top bg-plum sm:left-[23px]"
          />
          {steps.map(({ icon: Icon, title, body }, i) => {
            const isActive = i === active;
            return (
              <motion.li
                key={title}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.7, ease: easeOut }}
                className="relative"
              >
                <motion.span
                  animate={{
                    scale: isActive ? 1.15 : 1,
                    backgroundColor: i <= active ? "#5a2941" : "#fffcf7",
                    color: i <= active ? "#fffcf7" : "#6f625a",
                  }}
                  transition={{ duration: 0.4, ease: easeOut }}
                  className="absolute -left-10 top-7 flex h-8 w-8 items-center justify-center rounded-full border border-line text-xs font-semibold sm:-left-14 sm:h-12 sm:w-12"
                >
                  <Icon size={16} />
                </motion.span>
                <motion.div
                  animate={{
                    opacity: isActive ? 1 : 0.55,
                    borderColor: isActive ? "rgba(90,41,65,0.25)" : "rgba(231,220,207,1)",
                  }}
                  transition={{ duration: 0.4 }}
                  className="rounded-3xl border bg-paper p-7 shadow-[0_20px_50px_-30px_rgba(30,25,21,0.3)]"
                >
                  <p className="font-display text-sm text-rose">Langkah 0{i + 1}</p>
                  <h3 className="mt-1 font-display text-3xl text-ink">{title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{body}</p>
                </motion.div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
