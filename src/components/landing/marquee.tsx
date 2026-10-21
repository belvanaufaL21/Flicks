"use client";

import { motion } from "motion/react";

const items = [
  "Personal Color",
  "Body Shape",
  "Virtual Try-On",
  "Palet Warna",
  "Panduan Siluet",
  "Laporan Privat 72 Jam",
  "Bayar via QRIS",
];

export function Marquee() {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-line bg-paper/60 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-cream to-transparent" />
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
        className="flex w-max items-center gap-10"
      >
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-2xl text-ink/80 italic">
            {item}
            <span className="text-base not-italic text-accent">✦</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
