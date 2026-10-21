"use client";

import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { Menu, X } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";

const links = [
  { href: "#cara-kerja", label: "Cara Kerja" },
  { href: "#hasil", label: "Contoh Hasil" },
  { href: "#harga", label: "Harga" },
  { href: "#privasi", label: "Privasi" },
  { href: "#faq", label: "FAQ" },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#" className="flex items-baseline gap-1.5">
      <span className={`font-display text-2xl tracking-tight ${light ? "text-paper" : "text-ink"}`}>
        FLICKS
      </span>
      <span className="rounded-full bg-accent-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-paper">
        Lite
      </span>
    </a>
  );
}

export function Navbar() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Hide while scrolling down, reveal on any upward scroll.
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 480);
    setScrolled(y > 24);
  });

  return (
    <>
      <motion.div
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-accent-deep via-accent to-line"
      />
      <motion.header
        animate={{ y: hidden && !open ? "-110%" : "0%" }}
        transition={{ duration: 0.45, ease: easeOut }}
        className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6"
      >
        <nav
          className={`mx-auto flex max-w-6xl items-center justify-between rounded-full px-5 py-3 transition-[background-color,box-shadow,backdrop-filter] duration-500 ${
            scrolled || open
              ? "bg-paper/80 shadow-[0_8px_30px_-12px_rgba(37,34,31,0.25)] backdrop-blur-xl"
              : "bg-transparent"
          }`}
        >
          <Logo />
          <ul className="hidden items-center gap-8 text-sm text-muted md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="group relative transition-colors hover:text-ink">
                  {l.label}
                  <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <a
              href="#harga"
              className="hidden rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-deep sm:inline-block"
            >
              Mulai analisis
            </a>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-full p-2 text-ink md:hidden"
              aria-label={open ? "Tutup menu" : "Buka menu"}
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="mx-auto mt-2 max-w-6xl rounded-3xl bg-paper/95 p-4 shadow-xl backdrop-blur-xl md:hidden"
            >
              <ul className="flex flex-col">
                {links.map((l, i) => (
                  <motion.li
                    key={l.href}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i, ease: easeOut }}
                  >
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-4 py-3 text-ink hover:bg-cream"
                    >
                      {l.label}
                    </a>
                  </motion.li>
                ))}
              </ul>
              <a
                href="#harga"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-paper"
              >
                Mulai analisis
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>
    </>
  );
}
