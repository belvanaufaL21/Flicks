"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";

const noise =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Fine film grain over the whole page so flat fills read as printed paper.
export function Grain() {
  return (
    <div
      aria-hidden="true"
      // Own GPU layer: the noise tile is rasterised once and only composited while
      // scrolling, instead of being repainted over the page every frame.
      className="pointer-events-none fixed inset-0 z-[70] opacity-[0.045] [contain:strict] [transform:translateZ(0)]"
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

type DomeProps = React.ComponentProps<"section">;

// Section whose top edge is a shallow dome. The radius is static on purpose: animating
// border-radius on scroll repaints the whole section every frame.
export function DomeSection({ children, className = "", ...rest }: DomeProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-t-[50%_5rem] ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

const blobs = [
  "M100,20 C150,20 180,60 180,100 C180,150 140,180 100,180 C50,180 20,140 20,100 C20,50 50,20 100,20 Z",
  "M100,30 C160,10 190,70 170,110 C150,160 130,190 90,170 C40,160 10,130 30,90 C40,50 60,40 100,30 Z",
  "M110,15 C140,30 195,50 175,100 C165,140 150,175 100,185 C60,190 15,150 25,105 C30,60 70,5 110,15 Z",
];

// Organic shape that slowly drifts. Two irregular outlines layered and turned in
// opposite directions read as a morph, but only `transform` animates, which the GPU
// handles. Animating the path's `d` re-tessellated the shape on the main thread
// every frame.
export function MorphBlob({ className = "", duration = 14 }: { className?: string; duration?: number }) {
  return (
    <div className={className} aria-hidden="true">
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: [0, 14, -8, 0], scale: [1, 1.05, 0.97, 1] }}
        transition={{ duration, ease: "easeInOut", repeat: Infinity }}
      >
        <path fill="currentColor" d={blobs[1]} />
      </motion.svg>
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full opacity-70"
        animate={{ rotate: [0, -18, 10, 0], scale: [0.96, 1.02, 1, 0.96] }}
        transition={{ duration: duration * 1.3, ease: "easeInOut", repeat: Infinity }}
      >
        <path fill="currentColor" d={blobs[2]} />
      </motion.svg>
    </div>
  );
}

// A glowing line that sweeps up and down its container (scanner effect). The wrapper
// fills the container and moves with translateY, so the percentages match the old
// `top` animation while staying on the GPU instead of re-running layout every frame.
export function SweepLine({
  from,
  to,
  duration,
  className = "",
  layerClassName = "",
}: {
  from: string;
  to: string;
  duration: number;
  className?: string;
  layerClassName?: string;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${layerClassName}`}
      animate={{ y: [from, to, from] }}
      transition={{ duration, ease: "easeInOut", repeat: Infinity }}
    >
      <div className={`absolute top-0 ${className}`} />
    </motion.div>
  );
}
