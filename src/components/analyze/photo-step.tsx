"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { SweepLine } from "@/components/motion/shapes";
import { TagButton } from "@/components/ui/tag-button";
import { prepareBody, prepareFace, warmUp, type CheckId, type Prepared } from "@/lib/photo/prepare";
import type { FlowState } from "@/services/session-state.service";
import { ErrorBox, Heading } from "./ui";

// Step 2 as a tailor's pinboard. A guide figure stands on pattern paper. The full-body photo is pinned on the left at waist height, the face
// photo on the right at head height, each joined to the figure by a string. Each print
// carries its own criteria as hang tags tied beneath it, so a criterion always sits next
// to the photo it judges and lights up the moment that photo is checked (in the
// browser, where it is also cropped).

export type ReadyPhoto = Extract<Prepared, { ok: true }>;
export type Photos = { face: ReadyPhoto | null; body: ReadyPhoto | null };
type Kind = keyof Photos;
type Status = "idle" | "ok" | "fail";

const GUIDE = "/images/model-before.webp"; // 768×1376; anchor points measured on it
const GUIDE_ASPECT = 1376 / 768;

/** Each photo's criteria, in the order they are checked. */
const CRITERIA: Record<Kind, { text: string; checks: CheckId[] }[]> = {
  face: [
    { text: "Close-up, kepala utuh", checks: ["face_close"] },
    { text: "Wajah jelas, menghadap kamera", checks: ["face_one"] },
    { text: "Cahaya siang, tanpa filter", checks: ["light"] },
  ],
  body: [
    { text: "Berdiri tegak, pakaian pas", checks: ["body_one", "body_size"] },
    { text: "Kepala sampai kaki", checks: ["body_full", "body_head"] },
    { text: "Cahaya siang, tanpa filter", checks: ["light"] },
  ],
};

/** Where each print's string meets the figure (percent of the guide photo). */
const SLOTS: Record<Kind, { title: string; caption: string; empty: string; pin: { x: number; y: number }; tilt: number }> = {
  face: { title: "Foto wajah", caption: "wajahmu", empty: "tempel foto wajah", pin: { x: 57, y: 19 }, tilt: 3.5 },
  body: { title: "Foto seluruh badan", caption: "badanmu", empty: "tempel foto seluruh badan", pin: { x: 43, y: 46 }, tilt: -3 },
};

/** Print height ÷ width: the photo, plus the instant-print border and caption strip. */
const PRINT_RATIO: Record<Kind, number> = { face: 1 + 0.36, body: 4 / 3 + 0.36 };

type Props = {
  state: FlowState;
  photos: Photos;
  onPhotos: (p: Photos) => void;
  onSubmit: () => void;
  submitError: string | null;
};

export function PhotoStep({ state, photos, onPhotos, onSubmit, submitError }: Props) {
  const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState<Kind | null>(null);
  const [rejected, setRejected] = useState<Partial<Record<Kind, { reason: string; checks: Prepared["checks"] }>>>({});

  // Load the detectors while the visitor reads the board.
  useEffect(() => {
    warmUp("face");
    const t = setTimeout(() => warmUp("body"), 2500);
    return () => clearTimeout(t);
  }, []);

  async function accept(kind: Kind, file: File | undefined) {
    if (!file || checking) return;
    setChecking(kind);
    const result = await (kind === "face" ? prepareFace(file) : prepareBody(file));
    setChecking(null);
    if (!result.ok) {
      setRejected((r) => ({ ...r, [kind]: { reason: result.reason, checks: result.checks } }));
      return;
    }
    setRejected((r) => ({ ...r, [kind]: undefined }));
    const old = photos[kind];
    if (old) URL.revokeObjectURL(old.url);
    onPhotos({ ...photos, [kind]: result });
  }

  // A criterion fails if the last attempt failed it, passes once a check covering it
  // passed, and stays neutral until then.
  function statusOf(kind: Kind, checks: CheckId[]): Status {
    const last = rejected[kind]?.checks ?? photos[kind]?.checks ?? [];
    if (last.some((k) => checks.includes(k.id) && !k.ok)) return "fail";
    if (last.some((k) => checks.includes(k.id) && k.ok)) return "ok";
    return "idle";
  }

  const tagsFor = (kind: Kind) => CRITERIA[kind].map((c) => ({ text: c.text, status: statusOf(kind, c.checks) }));
  const lastReject = (["body", "face"] as Kind[]).map((k) => rejected[k] && { kind: k, ...rejected[k]! }).find(Boolean);
  const retake = state.analysis?.status === "needs_retake";
  const failed = state.analysis?.status === "failed";
  const ready = !!photos.face && !!photos.body;

  const slotProps = (kind: Kind): SlotProps => ({
    kind,
    photo: photos[kind],
    checking: checking === kind,
    busy: !!checking,
    rejected: !!rejected[kind],
    locked: kind === "body" && !photos.face,
    onFile: (f: File | undefined) => accept(kind, f),
  });

  return (
    <div>
      <Heading eyebrow="Langkah 2 · Foto" title={<>Dua foto, <em className="text-accent">satu peta</em>.</>}>
        Tempel foto wajah di samping kepala, lalu foto seluruh badan di samping pinggang. Setiap foto langsung diperiksa
        dan dipotong otomatis.
      </Heading>

      {retake && (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-ink">
          <p className="font-medium">Foto sebelumnya belum cukup jelas untuk dianalisis. Token kamu tidak terpakai.</p>
          {state.analysis!.photoIssues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {state.analysis!.photoIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {failed && (
        <div className="mt-6">
          <ErrorBox message={state.analysis!.error ?? "Analisis gagal. Token kamu tidak terpakai, silakan coba lagi."} />
        </div>
      )}

      {/* Pattern-paper board */}
      <div className="relative mt-8 overflow-hidden rounded-[2.25rem] border border-line bg-paper px-4 py-7 shadow-[0_30px_60px_-40px_rgba(37,34,31,0.45)] sm:px-8 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(154,128,96,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(154,128,96,0.09)_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-soft/60 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-accent-soft/50 blur-3xl" />

        <div className="relative">
          {/* Desktop: body print + its tags | figure | face print + its tags. */}
          <Stage
            className="hidden md:block"
            aspect={1 / (0.28 * GUIDE_ASPECT)}
            figure={{ left: 36, width: 28 }}
            columns={{ body: { left: 3, top: 13, width: 28, print: 14 }, face: { left: 69, top: 0, width: 28, print: 15 } }}
            tags={{ body: tagsFor("body"), face: tagsFor("face") }}
            slotProps={slotProps}
          />
          {/* Phone: body print | figure | face print, tags in two columns underneath. */}
          <Stage
            className="md:hidden"
            aspect={1 / (0.38 * GUIDE_ASPECT)}
            figure={{ left: 31, width: 38 }}
            columns={{ body: { left: 0, top: 30, width: 29, print: 28 }, face: { left: 71, top: 2, width: 29, print: 28 } }}
            tags={null}
            slotProps={slotProps}
          />
          <div className="mt-6 grid grid-cols-2 gap-3 md:hidden">
            {(["body", "face"] as Kind[]).map((k) => (
              <ul key={k} className="flex flex-col items-center gap-2.5">
                {tagsFor(k).map((t, i) => (
                  <li key={t.text}>
                    <HangTag text={t.text} status={t.status} tilt={i % 2 ? 1.2 : -1.2} compact />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {lastReject && (
            <motion.div
              key={lastReject.reason}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="relative mt-7 flex items-start gap-3 rounded-2xl border border-red-900/15 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <X size={16} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">{SLOTS[lastReject.kind].title}:</span> {lastReject.reason}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Consent and start, outside the board. */}
      <div className="mt-7 flex flex-col gap-5 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-14">
        <label className={`flex cursor-pointer items-start gap-3 text-sm ${ready ? "text-ink" : "text-muted"}`}>
          <input
            type="checkbox"
            checked={consent}
            disabled={!ready}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-deep)]"
          />
          <span>
            Saya setuju fotoku dianalisis AI dan dihapus otomatis setelah 72 jam.
            <span className="mt-0.5 block text-xs text-muted">Diproses Gemini (via OpenRouter) &amp; FASHN, tanpa dipakai untuk pelatihan.</span>
          </span>
        </label>
        <TagButton
          label="Mulai analisis"
          ready={ready && consent}
          onClick={onSubmit}
          fullWidth
          className="sm:ml-0 sm:w-auto"
        />
      </div>
      {submitError && <div className="mt-4"><ErrorBox message={submitError} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------

/** A column holding one print (and on desktop its tags); all values in percent of the stage. */
type Column = { left: number; top: number; width: number; print: number };
type TagView = { text: string; status: Status };
type SlotProps = {
  kind: Kind;
  photo: ReadyPhoto | null;
  checking: boolean;
  busy: boolean;
  rejected: boolean;
  locked: boolean;
  onFile: (f: File | undefined) => void;
};

/** A soft S-curve from (x1,y1) to (x2,y2): reads as a string, not a ruler line. */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

/**
 * The board. Everything is placed in percent of the stage, whose aspect is fixed so the
 * guide figure keeps its proportions and the pins stay on the head and the waist.
 */
function Stage({
  className,
  aspect,
  figure,
  columns,
  tags,
  slotProps,
}: {
  className: string;
  aspect: number;
  figure: { left: number; width: number };
  columns: Record<Kind, Column>;
  tags: Record<Kind, TagView[]> | null;
  slotProps: (k: Kind) => SlotProps;
}) {
  const kinds = Object.keys(columns) as Kind[];
  const fx = (x: number) => figure.left + (x / 100) * figure.width; // guide % -> stage x %
  // Where each string ends: the print's inner edge (facing the figure), at its middle.
  const printEnd = (k: Kind) => {
    const c = columns[k];
    const printLeft = c.left + (c.width - c.print) / 2;
    const x = k === "face" ? printLeft + 1 : printLeft + c.print - 1;
    const y = c.top + (c.print * PRINT_RATIO[k] * aspect) / 2;
    return { x, y };
  };

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: String(aspect) }}>
      {/* Guide figure, blended into the paper */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: easeOut }}
        className="absolute inset-y-0 overflow-hidden rounded-t-full rounded-b-[1.5rem] bg-[radial-gradient(ellipse_at_50%_35%,#f4ead9,#e6d7bf_70%)]"
        style={{ left: `${figure.left}%`, width: `${figure.width}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static guide image, decorative */}
        <img src={GUIDE} alt="" className="h-full w-full object-cover opacity-90 mix-blend-multiply saturate-[0.6]" />
        <span className="absolute inset-x-0 bottom-3 text-center font-display text-sm italic text-muted max-sm:hidden">contoh pose</span>
      </motion.div>

      {/* Strings from the figure to the prints */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {kinds.map((k, i) => {
          const end = printEnd(k);
          const done = !!slotProps(k).photo;
          return (
            <motion.path
              key={k}
              d={curve(fx(SLOTS[k].pin.x), SLOTS[k].pin.y, end.x, end.y)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1.25}
              strokeDasharray={done ? undefined : "3 5"}
              className={`${done ? "stroke-accent-deep" : "stroke-accent/60"} transition-colors duration-500`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 + i * 0.15, ease: easeOut }}
            />
          );
        })}
      </svg>

      {/* Pins on the head and the waist */}
      {kinds.map((k) => {
        const done = !!slotProps(k).photo;
        return (
          <span
            key={`pin-${k}`}
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${fx(SLOTS[k].pin.x)}%`, top: `${SLOTS[k].pin.y}%` }}
          >
            {!done && <span className="absolute inset-0 animate-ping rounded-full bg-accent/45" />}
            <span className={`relative block h-full w-full rounded-full ring-2 ring-paper transition-colors ${done ? "bg-accent-deep" : "bg-accent"}`} />
          </span>
        );
      })}

      {/* Prints, each with its tags tied underneath (desktop) */}
      {kinds.map((k) => {
        const c = columns[k];
        return (
          <div
            key={k}
            className="absolute flex flex-col items-center"
            style={{ left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%` }}
          >
            <div style={{ width: `${(c.print / c.width) * 100}%` }}>
              <Print {...slotProps(k)} />
            </div>
            {tags && (
              <ul className="relative mt-4 flex flex-col items-center gap-2.5">
                {/* the thread the tags hang on */}
                <span aria-hidden="true" className="absolute -top-4 bottom-4 left-1/2 w-px -translate-x-1/2 bg-accent/40" />
                {tags[k].map((t, i) => (
                  <motion.li
                    key={t.text}
                    className="relative"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.3 + i * 0.08, ease: easeOut }}
                  >
                    <HangTag text={t.text} status={t.status} tilt={(i % 2 ? 1.5 : -1.5) * (k === "face" ? 1 : -1)} />
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A hang tag: punched hole, criterion, and a stamp once it has been checked. */
function HangTag({ text, status, tilt, compact = false }: { text: string; status: Status; tilt: number; compact?: boolean }) {
  return (
    <motion.span
      animate={{ rotate: tilt, scale: status === "idle" ? 1 : [1, 1.06, 1] }}
      transition={{ duration: 0.45, ease: easeOut }}
      className={`relative inline-flex items-center gap-2 rounded-[0.9rem] border py-1.5 pl-2 pr-3 shadow-[0_8px_18px_-12px_rgba(37,34,31,0.5)] transition-colors duration-500 ${
        compact ? "max-w-[10.5rem]" : "whitespace-nowrap"
      } ${
        status === "ok"
          ? "border-accent-deep/30 bg-accent-soft"
          : status === "fail"
            ? "border-red-700/30 bg-red-50"
            : "border-line bg-paper"
      }`}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {status === "idle" ? (
          // the punched hole the thread goes through
          <span className="h-2.5 w-2.5 rounded-full bg-cream shadow-[inset_0_1px_2px_rgba(37,34,31,0.35)] ring-1 ring-line" />
        ) : (
          <motion.span
            initial={{ scale: 1.8, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 16 }}
            className={`flex h-5 w-5 items-center justify-center rounded-full text-paper ${status === "ok" ? "bg-accent-deep" : "bg-red-700"}`}
          >
            {status === "ok" ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
          </motion.span>
        )}
      </span>
      <span
        className={`font-display italic leading-tight ${compact ? "text-[13px]" : "text-[15px] leading-none"} ${
          status === "fail" ? "text-red-900" : "text-ink"
        }`}
      >
        {text}
      </span>
    </motion.span>
  );
}

/** An instant print taped to the board: the upload target, then the chosen photo. */
function Print({ kind, photo, checking, busy, rejected, locked, onFile }: SlotProps) {
  const slot = SLOTS[kind];
  const inputId = `photo-${kind}`;
  const disabled = locked || busy;
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, rotate: slot.tilt * 2 }}
      animate={{ opacity: locked ? 0.55 : 1, y: 0, rotate: slot.tilt }}
      whileHover={disabled ? undefined : { rotate: 0, y: -4, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className="relative"
    >
      {/* washi tape */}
      <span
        aria-hidden="true"
        className="absolute -top-2.5 left-1/2 z-10 h-5 w-[46%] -translate-x-1/2 rotate-[-3deg] bg-accent-light/55 shadow-sm [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]"
      />
      <label
        htmlFor={disabled ? undefined : inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) onFile(e.dataTransfer.files[0]);
        }}
        className={`block bg-white p-[6%] pb-0 shadow-[0_22px_34px_-20px_rgba(37,34,31,0.55)] ring-1 transition ${
          rejected && !photo ? "ring-red-700/40" : "ring-black/5"
        } ${disabled ? "cursor-default" : "cursor-pointer"}`}
      >
        <span className={`relative block overflow-hidden bg-cream ${kind === "face" ? "aspect-square" : "aspect-[3/4]"}`}>
          <AnimatePresence>
            {photo && (
              <motion.img
                key={photo.url}
                src={photo.url}
                alt={`${slot.title} yang dipakai`}
                initial={{ opacity: 0, filter: "brightness(1.6) saturate(0)" }}
                animate={{ opacity: 1, filter: "brightness(1) saturate(1)" }}
                transition={{ duration: 1.1, ease: easeOut }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </AnimatePresence>
          {checking && (
            <>
              <span className="absolute inset-0 bg-paper/50" />
              <SweepLine from="8%" to="92%" duration={1.6} className="inset-x-1 h-0.5 rounded-full bg-accent shadow-[0_0_12px_3px_rgba(154,128,96,0.6)]" />
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-accent-deep" />
              </span>
            </>
          )}
          {!photo && !checking && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 border border-dashed border-accent/50 p-2 text-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-accent-deep shadow-sm">
                {locked ? <span className="text-xs">2</span> : <Plus size={16} />}
              </span>
              <span className="text-[11px] leading-tight text-muted">{locked ? "setelah foto wajah" : slot.empty}</span>
            </span>
          )}
          {photo && !checking && (
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper shadow">
              <Check size={13} />
            </span>
          )}
        </span>
        {/* caption strip, written like a note on the print */}
        <span className="flex h-[1.9rem] items-center justify-center font-display text-sm italic text-ink/80 sm:h-[2.3rem] sm:text-base">
          {slot.caption}
        </span>
      </label>
      {photo && !busy && (
        <label
          htmlFor={inputId}
          aria-label={`Ganti ${slot.title.toLowerCase()}`}
          className="absolute left-[9%] top-[7%] z-10 flex cursor-pointer items-center gap-1 rounded-full bg-paper/90 px-2 py-1 text-[10px] font-medium text-ink shadow hover:bg-paper"
        >
          <RefreshCw size={10} /> <span className="max-sm:hidden">Ganti</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}

/** Detected face or body points, fading in one by one: the check is visibly real. */
export function LandmarkDots({ points, delay = 0 }: { points: { x: number; y: number }[]; delay?: number }) {
  const shown = points.filter((p) => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98);
  return (
    <span className="pointer-events-none absolute inset-0">
      {shown.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay + i * 0.04, duration: 0.3, ease: easeOut }}
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper shadow-[0_0_0_2px_rgba(111,91,64,0.55)]"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        />
      ))}
    </span>
  );
}
