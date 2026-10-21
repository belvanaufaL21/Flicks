"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { fadeUp, Stagger, easeOut } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

const stats = [
  { from: 0, to: 3, prefix: "", suffix: "", label: "hasil dalam satu paket", note: "Personal color, body shape & try-on" },
  { from: 0, to: 19, prefix: "Rp", suffix: "rb", label: "sekali bayar", note: "Tanpa langganan" },
  { from: 0, to: 72, prefix: "", suffix: " jam", label: "masa aktif laporan", note: "Via tautan rahasia" },
  { from: 9, to: 0, prefix: "", suffix: "", label: "akun yang perlu dibuat", note: "Langsung pakai" },
];

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
      <Stagger className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="bg-paper p-8">
            <p className="font-display text-6xl tracking-tight text-ink">
              <Counter {...s} />
            </p>
            <p className="mt-3 font-medium text-ink">{s.label}</p>
            <p className="mt-1 text-sm text-muted">{s.note}</p>
          </motion.div>
        ))}
      </Stagger>
    </section>
  );
}
