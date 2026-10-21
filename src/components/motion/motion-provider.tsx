"use client";

import { MotionConfig } from "motion/react";

// Honors the visitor's OS "reduce motion" setting for every motion component.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
