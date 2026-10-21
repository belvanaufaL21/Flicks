"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";

const noise =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Fine film grain over the whole page so flat fills read as printed paper.
export function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] opacity-[0.07] mix-blend-multiply"
      style={{ backgroundImage: noise }}
    />
  );
}

// Pulls its child slightly toward the mouse pointer.
export function Magnetic({
  children,
  strength = 0.3,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className={`inline-block ${className}`}
      onPointerMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (reduce || e.pointerType !== "mouse" || !rect) return;
        x.set((e.clientX - rect.left - rect.width / 2) * strength);
        y.set((e.clientY - rect.top - rect.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

type DomeProps = Omit<HTMLMotionProps<"section">, "style" | "ref"> & { depth?: number };

// Section whose top edge is a dome that flattens as it scrolls into view.
export function DomeSection({ children, className = "", depth = 9, ...rest }: DomeProps) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 25%"] });
  const r = useTransform(scrollYProgress, [0, 1], [depth, 2.5]);
  const radius = useMotionTemplate`50% ${r}rem`;

  return (
    <motion.section
      ref={ref}
      style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }}
      className={`relative overflow-hidden ${className}`}
      {...rest}
    >
      {children}
    </motion.section>
  );
}

const blobs = [
  "M100,20 C150,20 180,60 180,100 C180,150 140,180 100,180 C50,180 20,140 20,100 C20,50 50,20 100,20 Z",
  "M100,30 C160,10 190,70 170,110 C150,160 130,190 90,170 C40,160 10,130 30,90 C40,50 60,40 100,30 Z",
  "M110,15 C140,30 195,50 175,100 C165,140 150,175 100,185 C60,190 15,150 25,105 C30,60 70,5 110,15 Z",
];

// Organic shape that slowly morphs between a few outlines.
export function MorphBlob({ className = "", duration = 14 }: { className?: string; duration?: number }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <motion.path
        fill="currentColor"
        d={blobs[0]}
        animate={{ d: [...blobs, blobs[0]] }}
        transition={{ duration, ease: "easeInOut", repeat: Infinity }}
      />
    </svg>
  );
}
