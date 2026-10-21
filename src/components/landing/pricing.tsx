"use client";

import { motion } from "motion/react";
import { ArrowRight, Check, QrCode } from "lucide-react";
import { easeOut, fadeUp, Reveal, Stagger } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/shapes";
import { SectionHeading } from "./section-heading";

const included = [
  ["1× Analisis Personal Color", "Estimasi season, palet rekomendasi, dan warna untuk dicoba"],
  ["1× Analisis Body Shape", "Estimasi kategori bentuk tubuh dan panduan siluet"],
  ["1× Virtual Try-On", "Simulasi satu produk pilihan dari katalog"],
  ["Laporan privat 72 jam", "Dikirim lewat tautan rahasia, tanpa perlu akun"],
];

const receiptRows = [
  ["1× Token FLICKS", "Rp19.000"],
  ["Biaya langganan", "Rp0"],
  ["Biaya tersembunyi", "Rp0"],
];

// Zigzag tear along the bottom edge of the receipt.
const tornEdge =
  "[mask:conic-gradient(from_-45deg_at_bottom,#0000,#000_1deg_89deg,#0000_90deg)_50%/14px_100%]";

// A receipt that "prints" downward when it scrolls into view. The in-view trigger lives on
// an unclipped wrapper: a fully clipped element never counts as intersecting.
function Receipt() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.6 }}
      className="mt-12 max-w-xs -rotate-2"
    >
      <motion.div
        variants={{ hidden: { clipPath: "inset(0 0 100% 0)" }, show: { clipPath: "inset(0 0 0% 0)" } }}
        transition={{ duration: 1.4, ease: easeOut, delay: 0.2 }}
        className={`bg-paper px-6 pb-9 pt-6 shadow-[0_24px_40px_-24px_rgba(37,34,31,0.4)] ${tornEdge}`}
      >
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-display text-lg text-ink">FLICKS Lite</span>
          <span className="flex items-center gap-1.5">
            <QrCode size={14} /> QRIS
          </span>
        </div>
        <div className="my-4 border-t border-dashed border-line" />
        <ul className="space-y-2 font-mono text-xs text-muted">
          {receiptRows.map(([label, value], i) => (
            <motion.li
              key={label}
              variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
              transition={{ delay: 0.6 + i * 0.25 }}
              className="flex justify-between gap-4"
            >
              <span>{label}</span>
              <span className="text-ink">{value}</span>
            </motion.li>
          ))}
        </ul>
        <div className="my-4 border-t border-dashed border-line" />
        <motion.div
          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
          transition={{ delay: 1.5, ease: easeOut }}
          className="flex items-baseline justify-between"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Total</span>
          <span className="font-display text-3xl text-ink">Rp19.000</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// Arch-topped like a boutique hang tag; inner radius is the outer minus the border.
const outerShape = "rounded-t-[11rem] rounded-b-[2.25rem]";
const innerShape = "rounded-t-[calc(11rem-1.5px)] rounded-b-[calc(2.25rem-1.5px)]";

export function Pricing() {
  return (
    <section id="harga" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div className="relative">
          <SectionHeading
            align="left"
            eyebrow="Harga"
            title={
              <>
                Satu harga, <em className="text-accent">tanpa kejutan</em>.
              </>
            }
            description="Rincian paket ditampilkan jelas sebelum kamu membayar. Tidak ada langganan, tidak ada biaya tersembunyi."
          />
          <Stagger className="mt-8 flex flex-wrap gap-2">
            {["Sekali bayar", "QRIS", "Tanpa akun", "Tanpa langganan"].map((t) => (
              <motion.span
                key={t}
                variants={fadeUp}
                whileHover={{ y: -3, rotate: -2 }}
                className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink"
              >
                {t}
              </motion.span>
            ))}
          </Stagger>
          <Receipt />
        </div>

        <Reveal y={80} className="mx-auto w-full max-w-md">
          {/* The whole tag sways gently from its string */}
          <motion.div
            animate={{ rotate: [-1.6, 1.6] }}
            transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
            whileHover={{ rotate: 0, y: -6 }}
            style={{ transformOrigin: "50% -64px" }}
            className="relative pt-16"
          >
            <svg
              className="absolute left-1/2 top-0 h-[6.5rem] w-6 -translate-x-1/2"
              viewBox="0 0 24 104"
              aria-hidden="true"
            >
              <path d="M12 0 C 2 30, 22 60, 12 104" fill="none" stroke="currentColor" className="text-ink/35" strokeWidth="1.5" />
            </svg>

            <div className={`relative overflow-hidden p-[1.5px] ${outerShape}`}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 14, ease: "linear", repeat: Infinity }}
                className="absolute -inset-[60%] bg-[conic-gradient(from_0deg,var(--color-accent-deep),var(--color-accent),var(--color-line),var(--color-cream),var(--color-accent),var(--color-accent-deep))]"
              />
              <div className={`relative bg-paper px-8 pb-8 pt-16 sm:px-10 sm:pb-10 ${innerShape}`}>
                {/* Punched hole */}
                <span className="absolute left-1/2 top-8 h-5 w-5 -translate-x-1/2 rounded-full bg-cream shadow-[inset_0_2px_4px_rgba(37,34,31,0.25)] ring-1 ring-line" />

                <div className="text-center">
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-deep">
                    Harga soft launch
                  </span>
                  <p className="mt-5 font-display text-3xl text-ink">1 Token FLICKS</p>
                  <p className="mt-4 font-display text-7xl tracking-tight text-ink">Rp19.000</p>
                  <p className="text-sm text-muted">per token · dibayar sekali</p>
                </div>

                <div className="my-8 border-t border-dashed border-line" />

                <ul className="space-y-4">
                  {included.map(([title, body], i) => (
                    <motion.li
                      key={title}
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + i * 0.08, ease: easeOut, duration: 0.6 }}
                      className="flex gap-3"
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.3 + i * 0.08 }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-deep text-paper"
                      >
                        <Check size={14} />
                      </motion.span>
                      <span>
                        <span className="block font-medium text-ink">{title}</span>
                        <span className="text-sm text-muted">{body}</span>
                      </span>
                    </motion.li>
                  ))}
                </ul>

                <Magnetic strength={0.15} className="mt-10 w-full">
                  <a
                    href="/analyze"
                    className="group flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-paper transition-colors hover:bg-accent-deep"
                  >
                    Beli token & mulai
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </a>
                </Magnetic>
                <p className="mt-4 text-center text-xs text-muted">
                  Token diterbitkan setelah pembayaran terverifikasi. Hasil AI bersifat estimasi.
                </p>
              </div>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
