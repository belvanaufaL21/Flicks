"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { SweepLine } from "@/components/motion/shapes";
import { LandmarkDots } from "./photo-step";

type Point = { x: number; y: number };
type Shot = { url: string | null; points: Point[] };
type Kind = "face" | "body";

// Step 3: the visitor's own photos being read, on the same pinboard and polaroid prints
// as step 2. The face is read first (colour), its print large and the body print small
// beside it; then the two swap places in size, and the body print is read (proportions).
// The timing is a presentation of real work happening on the server, which reports
// completion through the parent's polling, so the last phase holds until it does.

const PHASES: { at: Kind; text: string; ms: number }[] = [
  { at: "face", text: "Membaca warna kulit, rambut, dan mata", ms: 3200 },
  { at: "face", text: "Menimbang undertone dan kontras", ms: 3200 },
  { at: "body", text: "Mengukur garis bahu, pinggang, dan pinggul", ms: 3600 },
  { at: "body", text: "Mencocokkan siluet yang paling sesuai", ms: 3600 },
  { at: "body", text: "Menyusun laporanmu", ms: 0 },
];

const PRINT: Record<Kind, { caption: string; aspect: string; big: string; small: string; tilt: number }> = {
  face: { caption: "wajahmu", aspect: "aspect-square", big: "w-[54%]", small: "w-[24%]", tilt: 2.5 },
  body: { caption: "badanmu", aspect: "aspect-[3/4]", big: "w-[44%]", small: "w-[20%]", tilt: -2.5 },
};

export function ScanStep({ face, body, uploading }: { face: Shot; body: Shot; uploading: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (uploading || PHASES[phase].ms === 0) return;
    const t = setTimeout(() => setPhase((p) => p + 1), PHASES[phase].ms);
    return () => clearTimeout(t);
  }, [uploading, phase]);

  const focus: Kind = uploading ? "face" : PHASES[phase].at;
  const shots = { face, body };

  return (
    <div className="flex w-full flex-col items-center" role="status" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">Langkah 3 · Analisis</p>
      <h1 className="mt-3 text-center font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">
        {uploading ? (
          <>Mengirim fotomu…</>
        ) : focus === "face" ? (
          <>
            Membaca <em className="text-accent">wajahmu</em>
          </>
        ) : (
          <>
            Membaca <em className="text-accent">siluetmu</em>
          </>
        )}
      </h1>

      {/* the pinboard */}
      <div className="relative mt-8 w-full max-w-2xl overflow-hidden rounded-[2rem] bg-paper px-5 py-8 ring-1 ring-line shadow-[0_30px_60px_-40px_rgba(37,34,31,0.45)] sm:px-10 sm:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(154,128,96,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(154,128,96,0.09)_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-soft/60 blur-3xl" />

        <div className="relative flex min-h-[18rem] items-center justify-center gap-[6%] sm:min-h-[22rem]">
          {(["face", "body"] as const).map((k, i) => (
            <ScanPrint
              key={k}
              kind={k}
              shot={shots[k]}
              order={i}
              active={focus === k}
              scanning={focus === k && !uploading}
              done={k === "face" && focus === "body"}
            />
          ))}
        </div>

        {/* which read is on: 1 wajah, 2 badan */}
        <div className="relative mt-6 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.18em]">
          {(["face", "body"] as const).map((k, i) => (
            <span key={k} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-8 bg-line" />}
              <span className={`flex items-center gap-1.5 transition-colors duration-500 ${focus === k ? "text-accent-deep" : "text-muted"}`}>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] transition-colors duration-500 ${
                    k === "face" && focus === "body" ? "bg-accent-deep text-paper" : focus === k ? "bg-accent-soft text-accent-deep" : "bg-cream text-muted"
                  }`}
                >
                  {k === "face" && focus === "body" ? <Check size={11} /> : i + 1}
                </span>
                {k === "face" ? "Warna" : "Bentuk tubuh"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 flex h-12 items-start justify-center px-2 sm:h-6">
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

/**
 * A polaroid print on the board. The one being read is large and scanned; the other is
 * small and tilted aside. Size changes animate through layout, so the two trade places
 * in one smooth turn.
 */
function ScanPrint({
  kind,
  shot,
  order,
  active,
  scanning,
  done,
}: {
  kind: Kind;
  shot: Shot;
  order: number;
  active: boolean;
  scanning: boolean;
  done: boolean;
}) {
  const p = PRINT[kind];
  return (
    <motion.div
      layout
      transition={{ layout: { type: "spring", stiffness: 140, damping: 20 } }}
      className={`relative shrink-0 ${active ? `${p.big} z-10` : `${p.small} self-start`}`}
      style={{ order }}
    >
      <motion.div
        animate={{ rotate: active ? p.tilt / 2 : p.tilt * 2, opacity: active || done ? 1 : 0.7 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
      >
        {/* washi tape */}
        <span
          aria-hidden="true"
          className="absolute -top-2.5 left-1/2 z-10 h-5 w-[46%] -translate-x-1/2 rotate-[-3deg] bg-accent-light/55 shadow-sm [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]"
        />
        <figure
          className={`bg-white p-[6%] pb-0 ring-1 ring-black/5 transition-shadow duration-500 ${
            active ? "shadow-[0_34px_50px_-24px_rgba(37,34,31,0.6)]" : "shadow-[0_18px_28px_-18px_rgba(37,34,31,0.5)]"
          }`}
        >
          <span className={`relative block overflow-hidden bg-cream ${p.aspect}`}>
            {shot.url && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob or short-lived signed URL
              <img src={shot.url} alt={`Foto ${p.caption} yang dianalisis`} className="absolute inset-0 h-full w-full object-cover" />
            )}
            {scanning && (
              <>
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(250,248,244,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(250,248,244,0.14)_1px,transparent_1px)] bg-[size:20px_20px]" />
                <SweepLine
                  from="6%"
                  to="94%"
                  duration={2.4}
                  className="inset-x-0 h-14 -translate-y-1/2 bg-gradient-to-b from-transparent via-accent-light/35 to-transparent"
                />
                <SweepLine
                  from="6%"
                  to="94%"
                  duration={2.4}
                  className="inset-x-2 h-0.5 rounded-full bg-paper shadow-[0_0_16px_4px_rgba(201,179,143,0.75)]"
                />
                <LandmarkDots key={kind} points={shot.points} delay={0.5} />
              </>
            )}
            {done && (
              <motion.span
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.3 }}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper shadow"
              >
                <Check size={13} />
              </motion.span>
            )}
          </span>
          <figcaption
            className={`flex items-center justify-center font-display italic text-ink/80 transition-all duration-500 ${
              active ? "h-[2.4rem] text-base sm:h-[2.8rem] sm:text-lg" : "h-[1.6rem] text-xs sm:h-[1.9rem] sm:text-sm"
            }`}
          >
            {p.caption}
          </figcaption>
        </figure>
      </motion.div>
    </motion.div>
  );
}
