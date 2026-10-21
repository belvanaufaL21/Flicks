"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";

export const easeOut = [0.22, 1, 0.36, 1] as const;

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOut } },
};

type RevealProps = HTMLMotionProps<"div"> & { delay?: number; y?: number };

// Fades and lifts its content in the first time it scrolls into view.
export function Reveal({ delay = 0, y = 28, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.85, ease: easeOut, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// Parent that staggers any `fadeUp` children as the group enters view.
export function Stagger({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
