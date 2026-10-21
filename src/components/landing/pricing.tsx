"use client";

import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { easeOut, fadeUp, Reveal, Stagger } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

const included = [
  ["1× Analisis Personal Color", "Estimasi season, palet rekomendasi, dan warna untuk dicoba"],
  ["1× Analisis Body Shape", "Estimasi kategori bentuk tubuh dan panduan siluet"],
  ["1× Virtual Try-On", "Simulasi satu produk pilihan dari katalog"],
  ["Laporan privat 72 jam", "Dikirim lewat tautan rahasia, tanpa perlu akun"],
];

export function Pricing() {
  return (
    <section id="harga" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Harga"
            title={
              <>
                Satu harga, <em className="text-plum">tanpa kejutan</em>.
              </>
            }
            description="Rincian paket ditampilkan jelas sebelum kamu membayar. Tidak ada langganan, tidak ada biaya tersembunyi."
          />
          <Stagger className="mt-8 flex flex-wrap gap-2">
            {["Sekali bayar", "QRIS", "Tanpa akun", "Tanpa langganan"].map((t) => (
              <motion.span
                key={t}
                variants={fadeUp}
                className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink"
              >
                {t}
              </motion.span>
            ))}
          </Stagger>
        </div>

        <Reveal y={60}>
          <motion.div
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="relative overflow-hidden rounded-[34px] p-[1.5px]"
          >
            {/* Slowly rotating gradient border */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 14, ease: "linear", repeat: Infinity }}
              className="absolute -inset-[60%] bg-[conic-gradient(from_0deg,#5a2941,#d9908a,#e8c8a0,#8da38a,#5a2941)]"
            />
            <div className="relative rounded-[33px] bg-paper p-8 sm:p-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">Paket</p>
                  <p className="mt-1 font-display text-3xl text-ink">1 Token FLICKS</p>
                </div>
                <span className="rounded-full bg-plum-soft px-3 py-1 text-xs font-medium text-plum">
                  Harga soft launch
                </span>
              </div>
              <p className="mt-8 flex items-baseline gap-2">
                <span className="font-display text-7xl tracking-tight text-ink">Rp19.000</span>
              </p>
              <p className="text-sm text-muted">per token · dibayar sekali</p>

              <ul className="mt-8 space-y-4">
                {included.map(([title, body], i) => (
                  <motion.li
                    key={title}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.08, ease: easeOut, duration: 0.6 }}
                    className="flex gap-3"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-plum text-paper">
                      <Check size={14} />
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{title}</span>
                      <span className="text-sm text-muted">{body}</span>
                    </span>
                  </motion.li>
                ))}
              </ul>

              <a
                href="/analyze"
                className="group mt-10 flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-paper transition-colors hover:bg-plum"
              >
                Beli token & mulai
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </a>
              <p className="mt-4 text-center text-xs text-muted">
                Token diterbitkan setelah pembayaran terverifikasi. Hasil AI bersifat estimasi.
              </p>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
