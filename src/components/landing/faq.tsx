"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { easeOut, fadeUp, Reveal, Stagger } from "@/components/motion/reveal";
import { MorphBlob } from "@/components/motion/shapes";
import { brand } from "@/lib/brand";
import { SectionHeading } from "./section-heading";

const faqs = [
  {
    q: "Apa itu FLICKS Lite?",
    a: "Layanan web self-service yang memberi estimasi personal color, analisis body shape, dan satu simulasi virtual try-on berbasis AI — dirangkum dalam satu laporan privat.",
  },
  {
    q: "Apa saja yang saya dapat dari 1 token?",
    a: "Satu analisis personal color, satu analisis body shape, dan satu output virtual try-on dari produk yang kamu pilih. Harganya Rp19.000, dibayar sekali.",
  },
  {
    q: "Apakah saya perlu membuat akun?",
    a: "Tidak. Setelah pembayaran terverifikasi dan proses selesai, kamu menerima tautan rahasia ke laporanmu yang aktif selama 72 jam.",
  },
  {
    q: "Bagaimana cara membayarnya?",
    a: "Pembayaran menggunakan QRIS. Token hanya diterbitkan setelah server kami menerima konfirmasi pembayaran yang sah.",
  },
  {
    q: "Foto seperti apa yang dibutuhkan?",
    a: "Panduan lengkap muncul sebelum upload. Secara umum: cahaya alami yang merata, tanpa filter, wajah dan tubuh terlihat jelas, dengan latar belakang polos. Foto yang tidak memenuhi syarat akan diminta ulang sebelum diproses.",
  },
  {
    q: "Seberapa akurat hasilnya?",
    a: "Hasil berupa estimasi dan saran gaya, bukan diagnosis atau pengukuran profesional. Bila bukti dari foto kurang, sistem menandai hasil sebagai tidak konklusif alih-alih memaksakan kategori.",
  },
  {
    q: "Bagaimana kalau proses AI gagal?",
    a: "Sistem dirancang agar token tidak terpotong dua kali, termasuk saat kamu menekan tombol berulang atau penyedia AI sedang lambat. Bila terjadi kegagalan, token mengikuti kebijakan pemulihan kami.",
  },
  {
    q: "Ke mana foto saya dikirim dan berapa lama disimpan?",
    a: "Foto disimpan di storage privat dan diproses oleh Google Gemini serta FASHN API. Laporan kedaluwarsa setelah 72 jam dan foto dijadwalkan terhapus sesuai masa retensi.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-32"
    >
      <div className="lg:sticky lg:top-32 lg:self-start">
        <SectionHeading
          align="left"
          eyebrow="FAQ"
          title={
            <>
              Pertanyaan yang <em className="text-accent">sering muncul</em>
            </>
          }
          description="Belum menemukan jawabannya? Detail lengkap selalu ditampilkan sebelum kamu membayar."
        />
        {/* Arch window with a short question-and-answer exchange playing inside */}
        <Reveal delay={0.2} className="relative mt-12 hidden h-80 w-64 overflow-hidden rounded-t-full bg-accent-soft lg:block">
          <MorphBlob className="absolute -bottom-16 -left-10 h-64 w-64 text-line" />
          <div className="absolute inset-x-5 bottom-8 flex flex-col gap-3 text-sm">
            <motion.p
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.5 }}
              className="ml-auto origin-bottom-right rounded-2xl rounded-br-md bg-paper px-4 py-2.5 text-ink shadow-sm"
            >
              Perlu bikin akun?
            </motion.p>
            <div className="relative">
              {/* Typing dots hold the reply's place, then give way to it */}
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: [0, 1, 1, 0] }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, times: [0, 0.1, 0.85, 1], delay: 1 }}
                className="absolute left-0 top-0 flex gap-1 rounded-2xl rounded-bl-md bg-ink px-4 py-3.5"
              >
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.12 }}
                    className="h-1.5 w-1.5 rounded-full bg-paper/70"
                  />
                ))}
              </motion.span>
              <motion.p
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 2.5 }}
                className="mr-6 origin-bottom-left rounded-2xl rounded-bl-md bg-ink px-4 py-2.5 text-paper shadow-sm"
              >
                Tidak. Cukup buka tautan rahasia, aktif 72 jam.
              </motion.p>
            </div>
          </div>
        </Reveal>
      </div>
      <Stagger className="divide-y divide-line border-y border-line">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <motion.div key={f.q} variants={fadeUp}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-6 py-6 text-left"
              >
                <span className="font-display text-xl text-ink sm:text-2xl">{f.q}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0, backgroundColor: isOpen ? brand.accent : brand.paper }}
                  transition={{ duration: 0.3, ease: easeOut }}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line ${
                    isOpen ? "text-paper" : "text-ink"
                  }`}
                >
                  <Plus size={16} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: easeOut }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-2xl pb-6 leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </Stagger>
    </section>
  );
}
