"use client";

import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";

const items = ["Personal Color", "Body Shape", "Virtual Try-On", "Laporan Privat 72 Jam", "Bayar via QRIS", "Tanpa Akun"];

const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

// A single, quiet strip that drifts slowly at a constant pace.
export function Marquee() {
  const baseX = useMotionValue(0);
  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);
  const reduce = useReducedMotion();

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    baseX.set(baseX.get() - 0.9 * (delta / 1000));
  });

  const row = [...items, ...items, ...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-line/80 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-cream to-transparent" />
      <motion.ul style={{ x }} className="flex w-max items-center gap-12">
        {row.map((item, i) => (
          <li key={i} className="flex items-center gap-12 font-display text-xl italic text-muted">
            {item}
            <span className="h-1 w-1 rounded-full bg-accent/60" aria-hidden="true" />
          </li>
        ))}
      </motion.ul>
    </div>
  );
}
