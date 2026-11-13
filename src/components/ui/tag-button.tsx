"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";

// The brand's main call to action: a large swing tag with a pointed end, a punched
// hole and a string curling out of it. Used for every primary action, on the landing
// page and through the analysis flow, so they all look and move alike.
//
// At rest it holds still. Hover is meant to be felt: it lifts, changes colour, the
// string pulls taut, the arrow turns and a sheen runs across. Not ready, it is muted
// paper with a dashed edge and shakes its head on hover. It uses aria-disabled rather
// than disabled, because a disabled button gets no hover events in Chrome.

const STRING_RELAXED = "M60 20 C 44 20, 40 4, 26 8 S 6 30, 2 22";
const STRING_TAUT = "M60 20 C 47 20, 41 15, 29 17 S 9 23, 2 20";

const MotionLink = motion.create(Link);

type Tone = "ink" | "paper";

/** Colours per tone: "ink" on light backgrounds, "paper" on dark ones. */
const TONES: Record<Tone, { rest: string; hover: string; text: string; hole: string; circle: string; circleHover: string; string: string; stringHover: string; shadow: string; shadowHover: string }> = {
  ink: {
    rest: "bg-ink",
    hover: "bg-accent-deep",
    text: "text-paper",
    hole: "bg-accent-light ring-2 ring-accent-deep",
    circle: "bg-paper text-ink",
    circleHover: "bg-accent-light text-ink",
    string: "text-ink/60",
    stringHover: "text-accent-deep",
    shadow: "shadow-[0_18px_30px_-16px_rgba(37,34,31,0.7)]",
    shadowHover: "shadow-[0_28px_40px_-18px_rgba(111,91,64,0.8)]",
  },
  paper: {
    rest: "bg-paper",
    hover: "bg-accent-soft",
    text: "text-ink",
    hole: "bg-cream ring-2 ring-accent",
    circle: "bg-ink text-paper",
    circleHover: "bg-accent-deep text-paper",
    string: "text-paper/55",
    stringHover: "text-paper",
    shadow: "shadow-[0_18px_30px_-16px_rgba(0,0,0,0.55)]",
    shadowHover: "shadow-[0_28px_40px_-18px_rgba(0,0,0,0.65)]",
  },
};

type Props = {
  label: string;
  ready?: boolean;
  busy?: boolean;
  busyLabel?: string;
  tone?: Tone;
  size?: "md" | "lg";
  /** Stretch to the container width (leaving room on the left for the string). */
  fullWidth?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function TagButton({
  label,
  ready = true,
  busy = false,
  busyLabel = "Memproses…",
  tone = "ink",
  size = "lg",
  fullWidth = false,
  href,
  onClick,
  className = "",
}: Props) {
  const [hover, setHover] = useState(false);
  const [sheens, setSheens] = useState(0);
  const t = TONES[tone];
  const live = ready && !busy; // can be pressed right now
  const lifted = live && hover;
  const fill = !ready ? "bg-paper" : lifted ? t.hover : t.rest;
  const big = size === "lg";

  const motionProps = {
    "aria-disabled": !live || undefined,
    "aria-busy": busy || undefined,
    onHoverStart: () => {
      setHover(true);
      if (live) setSheens((n) => n + 1);
    },
    onHoverEnd: () => setHover(false),
    className: `group relative flex shrink-0 items-stretch outline-none ${
      fullWidth ? "ml-12 w-[calc(100%-3rem)]" : "ml-12 w-fit"
    } ${live ? "cursor-pointer" : busy ? "cursor-wait" : "cursor-not-allowed"} focus-visible:[&>span:last-child]:ring-2 focus-visible:[&>span:last-child]:ring-accent ${className}`,
    style: { transformOrigin: "1.6rem 50%" },
    animate: lifted
      ? { y: -5, scale: 1.03, x: 0 }
      : !ready && hover
        ? { x: [0, -6, 6, -4, 4, 0], y: 0, scale: 1 }
        : { y: 0, scale: 1, x: 0 },
    transition: lifted
      ? { type: "spring" as const, stiffness: 300, damping: 18 }
      : { duration: 0.45, ease: "easeOut" as const },
    whileTap: live ? { scale: 0.96 } : undefined,
  };

  const inner = (
    <>
      {/* the string, curling out of the hole; pulled taut while the tag is lifted */}
      <svg
        aria-hidden="true"
        viewBox="0 0 60 40"
        className={`absolute -left-11 top-1/2 h-10 w-14 -translate-y-1/2 overflow-visible transition-colors duration-300 ${
          !ready ? "text-accent/50" : lifted ? t.stringHover : t.string
        }`}
      >
        <motion.path
          d={STRING_RELAXED}
          animate={{ d: lifted ? STRING_TAUT : STRING_RELAXED }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
          fill="none"
          stroke="currentColor"
          strokeWidth={lifted ? 1.8 : 1.4}
        />
      </svg>

      {/* pointed end with the punched hole */}
      <span
        className={`relative w-7 shrink-0 transition-colors duration-300 ${fill} ${
          ready ? "" : "border-y border-l border-dashed border-accent/50"
        } [clip-path:polygon(100%_0,100%_100%,0_50%)]`}
      />
      <span
        aria-hidden="true"
        className={`absolute left-[1.15rem] top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full shadow-[inset_0_1px_2px_rgba(37,34,31,0.45)] transition-colors duration-300 ${
          ready ? t.hole : "bg-cream ring-1 ring-line"
        }`}
      />

      {/* body */}
      <span
        className={`relative flex flex-1 items-center gap-4 overflow-hidden rounded-r-[1.4rem] pl-5 pr-3 transition-[background-color,box-shadow] duration-300 ${
          big ? "py-3.5" : "py-2.5"
        } ${fill} ${
          !ready
            ? "border border-l-0 border-dashed border-accent/50 text-muted"
            : `${t.text} ${lifted ? t.shadowHover : t.shadow}`
        }`}
      >
        {/* a sheen that runs across once on every hover */}
        {live && sheens > 0 && (
          <motion.span
            key={sheens}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent ${
              tone === "ink" ? "via-paper/20" : "via-white/70"
            } to-transparent`}
            initial={{ x: "-120%" }}
            animate={{ x: "420%" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          />
        )}
        <span
          className={`relative whitespace-nowrap font-display italic leading-tight transition-[letter-spacing] duration-300 ${
            big ? "text-2xl" : "text-xl"
          } ${lifted ? "tracking-wide" : ""}`}
        >
          {busy ? busyLabel : label}
        </span>
        <span
          className={`ml-auto flex shrink-0 items-center justify-center rounded-full transition-all duration-300 ${big ? "h-11 w-11" : "h-10 w-10"} ${
            !ready ? "border border-dashed border-accent/50 text-accent" : lifted ? `translate-x-1 ${t.circleHover}` : t.circle
          }`}
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <ArrowRight size={18} className={`transition-transform duration-300 ${lifted ? "-rotate-45" : ""}`} />
          )}
        </span>
      </span>
    </>
  );

  if (href && live) {
    const external = /^https?:\/\//.test(href);
    return external ? (
      <motion.a href={href} {...motionProps}>
        {inner}
      </motion.a>
    ) : (
      <MotionLink href={href} {...motionProps}>
        {inner}
      </MotionLink>
    );
  }
  return (
    <motion.button type="button" aria-label={label} onClick={() => live && onClick?.()} {...motionProps}>
      {inner}
    </motion.button>
  );
}
