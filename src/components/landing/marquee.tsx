"use client";

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";

const top = ["Personal Color", "Body Shape", "Virtual Try-On", "Palet Warna", "Panduan Siluet"];
const bottom = ["Laporan Privat 72 Jam", "Bayar via QRIS", "Tanpa Akun", "Sekali Bayar", "Hasil Estimasi"];

const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

// Endless ribbon that speeds up while the page is being scrolled.
function Ribbon({
  items,
  direction,
  className,
}: {
  items: string[];
  direction: 1 | -1;
  className: string;
}) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(velocity, [-1500, 0, 1500], [5, 0, 5], { clamp: false });
  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);
  const reduce = useReducedMotion();

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const move = direction * 1.6 * (delta / 1000) * (1 + Math.abs(boost.get()));
    baseX.set(baseX.get() + move);
  });

  const row = [...items, ...items, ...items, ...items];
  return (
    <div className={`-mx-[5%] w-[110%] overflow-hidden py-4 ${className}`}>
      <motion.div style={{ x }} className="flex w-max items-center gap-10">
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-2xl italic sm:text-3xl">
            {item}
            <span className="text-base not-italic opacity-60">✦</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function Marquee() {
  return (
    <div className="relative py-10">
      <Ribbon items={top} direction={-1} className="relative z-10 -rotate-2 bg-ink text-paper shadow-xl" />
      <Ribbon items={bottom} direction={1} className="-mt-4 rotate-[1.5deg] bg-accent-soft text-ink" />
    </div>
  );
}
