"use client";

import { motion } from "motion/react";
import { Palette, Ruler, Wallet, Repeat } from "lucide-react";
import { fadeUp, Stagger } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

const items = [
  {
    icon: Palette,
    problem: "Bingung warna apa yang bikin wajah terlihat segar?",
    answer: "Dapatkan estimasi season dan palet warna yang layak kamu coba.",
  },
  {
    icon: Ruler,
    problem: "Tidak yakin potongan baju yang pas untuk bentuk tubuhmu?",
    answer: "Lihat estimasi body shape beserta panduan siluet dan fit secara umum.",
  },
  {
    icon: Wallet,
    problem: "Konsultasi personal color manual terasa mahal dan ribet?",
    answer: "Coba sendiri dari rumah dengan harga transparan sejak awal.",
  },
  {
    icon: Repeat,
    problem: "Tidak mau terikat langganan bulanan?",
    answer: "Cukup beli satu token, pakai sekali, selesai.",
  },
];

export function Problems() {
  return (
    <section className="bg-paper py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Dari ragu jadi yakin"
          title={
            <>
              Ubah pertanyaan sehari-hari jadi <em className="text-accent">panduan gaya</em>.
            </>
          }
          description="FLICKS Lite dirancang untuk kamu yang ingin mengenal warna dan siluet diri sendiri, dengan konteks yang relevan untuk pengguna Indonesia."
        />
        <Stagger className="mt-16 grid gap-5 md:grid-cols-2">
          {items.map(({ icon: Icon, problem, answer }) => (
            <motion.article
              key={problem}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="group relative overflow-hidden rounded-3xl border border-line bg-cream/60 p-8"
            >
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/0 blur-2xl transition-colors duration-500 group-hover:bg-accent/25" />
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-accent-deep shadow-sm">
                <Icon size={22} />
              </span>
              <p className="mt-6 text-sm text-muted line-through decoration-accent/60">{problem}</p>
              <p className="mt-3 font-display text-2xl leading-snug text-ink">{answer}</p>
            </motion.article>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
