"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "motion/react";
import { easeOut } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

// Each stat sits on a "swatch" — together they read like a color fan.
const stats = [
  { from: 0, to: 3, prefix: "", suffix: "", label: "hasil dalam satu paket", tone: "bg-paper text-ink ring-1 ring-line", float: 6 },
  { from: 0, to: 19, prefix: "Rp", suffix: "rb", label: "sekali bayar", tone: "bg-accent-soft text-ink", float: -8 },
  { from: 0, to: 72, prefix: "", suffix: " jam", label: "masa aktif laporan", tone: "bg-accent-deep text-paper", float: 7 },
  { from: 9, to: 0, prefix: "", suffix: "", label: "akun yang perlu dibuat", tone: "bg-ink text-paper", float: -6 },
];

const swatch: Variants = {
  hidden: { opacity: 0, scale: 0.4, rotate: -20, y: 40 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    rotate: 0,
    y: 0,
    transition: { type: "spring", stiffness: 140, damping: 14, delay: 0.1 + i * 0.12 },
  }),
};

function Counter({ from, to, prefix, suffix }: { from: number; to: number; prefix: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!inView || !node) return;
    const render = (v: number) => {
      node.textContent = `${prefix}${Math.round(v)}${suffix}`;
    };
    if (reduce) {
      render(to);
      return;
    }
    const controls = animate(from, to, { duration: 1.8, ease: easeOut, onUpdate: render });
    return () => controls.stop();
  }, [inView, reduce, from, to, prefix, suffix]);

  return (
    <span ref={ref}>
      {prefix}
      {from}
      {suffix}
    </span>
  );
}

export function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <SectionHeading
        eyebrow="Satu token, tiga jawaban"
        title={
          <>
            Konsultasi gaya, <em className="text-accent">versi saku</em>.
          </>
        }
        description="Satu kali beli langsung memberimu gambaran warna, siluet, dan simulasi outfit — tanpa perlu janji temu atau komitmen bulanan."
      />
      <motion.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        className="mt-16 grid grid-cols-2 justify-items-center gap-4 md:flex md:justify-center md:gap-0"
      >
        {stats.map((s, i) => (
          <motion.li
            key={s.label}
            custom={i}
            variants={swatch}
            whileHover={{ scale: 1.08, zIndex: 10 }}
            className={`relative md:-ml-8 md:first:ml-0 ${i % 2 ? "md:mt-16" : ""}`}
          >
            <motion.div
              animate={{ y: [0, s.float, 0] }}
              transition={{ duration: 5 + i, ease: "easeInOut", repeat: Infinity }}
              className={`flex aspect-square w-40 flex-col items-center justify-center rounded-full p-6 text-center shadow-[0_30px_60px_-30px_rgba(37,34,31,0.45)] sm:w-48 lg:w-60 ${s.tone}`}
            >
              <p className="font-display text-5xl leading-none tracking-tight lg:text-6xl">
                <Counter {...s} />
              </p>
              <p className="mt-2 max-w-[9rem] text-xs font-medium leading-snug opacity-80 sm:text-sm">
                {s.label}
              </p>
            </motion.div>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
