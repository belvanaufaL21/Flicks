"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { easeOut } from "@/components/motion/reveal";
import { LandmarkDots } from "./photo-step";
import { ArchFrame } from "./ui";

type Point = { x: number; y: number };
type Shot = { url: string | null; points: Point[] };

// Step 3: the visitor's own photos being read, rather than an abstract spinner. The
// face is scanned first (colour), then the body (proportions); captions follow along.
// The timing is a presentation of real work happening on the server, which reports
// completion through the parent's polling.

const PHASES = [
  { at: "face", text: "Membaca warna kulit, rambut, dan mata" },
  { at: "face", text: "Menimbang undertone dan kontras" },
  { at: "body", text: "Mengukur garis bahu, pinggang, dan pinggul" },
  { at: "body", text: "Mencocokkan siluet yang paling sesuai" },
] as const;

export function ScanStep({ face, body, uploading }: { face: Shot; body: Shot; uploading: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (uploading) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 2600);
    return () => clearInterval(t);
  }, [uploading]);

  const focus = uploading ? null : PHASES[phase].at;

  return (
    <div className="flex flex-col items-center" role="status" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">Langkah 3 · Analisis</p>
      <h1 className="mt-3 text-center font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">
        {uploading ? (
          <>Mengirim fotomu…</>
        ) : (
          <>
            Membaca <em className="text-accent">fotomu</em>
          </>
        )}
      </h1>

      <div className="mt-10 grid w-full max-w-xl grid-cols-[1fr_1.25fr] items-end gap-4 sm:gap-6">
        <Frame shot={face} label="Wajah" aspect="aspect-[4/5]" active={focus === "face" || uploading} done={focus === "body"} />
        <Frame shot={body} label="Seluruh badan" aspect="aspect-[3/4]" active={focus === "body" || uploading} done={false} />
      </div>

      <div className="mt-8 h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={uploading ? "up" : phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: easeOut }}
            className="text-center text-muted"
          >
            {uploading ? "Mengunggah foto dengan aman" : PHASES[phase].text}…
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="mt-6 text-xs text-muted">Biasanya selesai dalam 15–25 detik. Halaman ini boleh direfresh.</p>
    </div>
  );
}

function Frame({ shot, label, aspect, active, done }: { shot: Shot; label: string; aspect: string; active: boolean; done: boolean }) {
  return (
    <motion.figure
      animate={{ opacity: active || done ? 1 : 0.55, scale: active ? 1 : 0.97 }}
      transition={{ duration: 0.6, ease: easeOut }}
    >
      <ArchFrame src={shot.url} alt={`Foto ${label.toLowerCase()} yang dianalisis`} className={aspect} scanning={active}>
        {active && <LandmarkDots points={shot.points} delay={0.2} />}
        {done && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/15">
            <span className="rounded-full bg-paper/95 px-3 py-1 text-xs font-medium text-accent-deep shadow">Terbaca</span>
          </span>
        )}
      </ArchFrame>
      <figcaption className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-muted">{label}</figcaption>
    </motion.figure>
  );
}
