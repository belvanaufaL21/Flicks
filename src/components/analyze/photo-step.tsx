"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { SweepLine } from "@/components/motion/shapes";
import { prepareBody, prepareFace, warmUp, type CheckId, type Prepared } from "@/lib/photo/prepare";
import type { FlowState } from "@/services/session-state.service";
import { ErrorBox, Heading, PrimaryButton } from "./ui";

// Step 2 as a body map. One guide figure in the middle; the photo criteria sit around
// it as anatomy callouts pointing at the part they are about; the two upload frames
// sit beside the head (face photo) and beside the waist (full-body photo). Each photo
// is checked and cropped in the browser the moment it is chosen, and the callouts
// light up with the result.

export type ReadyPhoto = Extract<Prepared, { ok: true }>;
export type Photos = { face: ReadyPhoto | null; body: ReadyPhoto | null };
type Kind = keyof Photos;
type Status = "idle" | "ok" | "fail";

const GUIDE = "/images/model-before.webp"; // 768×1376; anchor points measured on it
const GUIDE_ASPECT = 1376 / 768;

/** Criteria, each pointing at a spot on the guide figure (percent of the photo). */
const CRITERIA: { id: string; text: string; kinds: Kind[]; checks: CheckId[]; at: { x: number; y: number }; labelY: number }[] = [
  { id: "close", text: "Close-up, kepala tidak terpotong", kinds: ["face"], checks: ["face_close"], at: { x: 50, y: 11 }, labelY: 10 },
  { id: "front", text: "Wajah jelas, menghadap kamera", kinds: ["face"], checks: ["face_one"], at: { x: 49, y: 19 }, labelY: 19.5 },
  { id: "light", text: "Cahaya siang, tanpa filter", kinds: ["face", "body"], checks: ["light"], at: { x: 46, y: 22.5 }, labelY: 29 },
  { id: "pose", text: "Berdiri tegak, pakaian pas badan", kinds: ["body"], checks: ["body_one", "body_size"], at: { x: 44, y: 46 }, labelY: 47 },
  { id: "full", text: "Kepala sampai kaki masuk foto", kinds: ["body"], checks: ["body_full", "body_head"], at: { x: 46, y: 88 }, labelY: 87 },
];

const SLOTS: Record<Kind, { title: string; short: string; purpose: string; at: { x: number; y: number } }> = {
  face: { title: "Foto wajah", short: "Wajah", purpose: "Untuk personal color", at: { x: 56, y: 19 } },
  body: { title: "Foto seluruh badan", short: "Seluruh badan", purpose: "Body shape & try-on", at: { x: 57, y: 46 } },
};

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

  // Load the detectors while the visitor reads the map.
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

  // A criterion is ok once a passing photo covers it, failed if the last attempt failed it.
  function statusOf(c: (typeof CRITERIA)[number]): Status {
    let seen = false;
    for (const kind of c.kinds) {
      const fail = rejected[kind]?.checks.find((k) => c.checks.includes(k.id) && !k.ok);
      if (fail) return "fail";
      const checks = photos[kind]?.checks ?? rejected[kind]?.checks ?? [];
      if (checks.some((k) => c.checks.includes(k.id) && k.ok)) seen = true;
    }
    const allDone = c.kinds.every((k) => photos[k]);
    return seen && (allDone || c.kinds.length === 1) ? "ok" : "idle";
  }

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
        Unggah foto wajah di samping kepala, lalu foto seluruh badan di samping pinggang. Setiap foto langsung diperiksa
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

      <div className="mt-8 rounded-[2.25rem] border border-line bg-paper px-4 py-6 shadow-[0_30px_60px_-40px_rgba(37,34,31,0.45)] sm:px-8 sm:py-8">
        {/* Desktop: callouts | figure | upload frames. Coordinates are percent of the stage. */}
        <Stage
          className="hidden md:block"
          aspect={1 / (0.32 * GUIDE_ASPECT)}
          figure={{ left: 34, width: 32 }}
          slots={{ face: { left: 72, top: 3, width: 14 }, body: { left: 72, top: 35, width: 14 } }}
          callouts={CRITERIA.map((c) => ({ ...c, status: statusOf(c) }))}
          slotProps={slotProps}
        />
        {/* Phone: figure | upload frames, criteria as chips underneath. */}
        <Stage
          className="md:hidden"
          aspect={1 / (0.52 * GUIDE_ASPECT)}
          figure={{ left: 0, width: 52 }}
          slots={{ face: { left: 62, top: 2, width: 34 }, body: { left: 62, top: 48, width: 34 } }}
          callouts={[]}
          slotProps={slotProps}
        />
        <ul className="mt-5 flex flex-wrap gap-2 md:hidden">
          {CRITERIA.map((c) => (
            <li key={c.id}>
              <CriterionChip text={c.text} status={statusOf(c)} />
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {lastReject && (
            <motion.div
              key={lastReject.reason}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-2xl border border-red-900/15 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <X size={16} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">{SLOTS[lastReject.kind].title}:</span> {lastReject.reason}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Consent: one line, then go. */}
        <div className="mt-6 flex flex-col gap-4 border-t border-dashed border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
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
          <PrimaryButton className="shrink-0 sm:w-auto" disabled={!ready || !consent} onClick={onSubmit}>
            Mulai analisis <Sparkles size={16} />
          </PrimaryButton>
        </div>
        {submitError && <div className="mt-4"><ErrorBox message={submitError} /></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------

type Box = { left: number; top?: number; width: number };
type SlotProps = {
  kind: Kind;
  photo: ReadyPhoto | null;
  checking: boolean;
  busy: boolean;
  rejected: boolean;
  locked: boolean;
  onFile: (f: File | undefined) => void;
};

/**
 * The map. Everything is placed in percent of the stage, whose aspect is fixed so the
 * guide figure keeps its proportions and the anchor points stay on the right body part.
 */
function Stage({
  className,
  aspect,
  figure,
  slots,
  callouts,
  slotProps,
}: {
  className: string;
  aspect: number;
  figure: Box;
  slots: Record<Kind, Box>;
  callouts: ((typeof CRITERIA)[number] & { status: Status })[];
  slotProps: (k: Kind) => SlotProps;
}) {
  const fx = (x: number) => figure.left + (x / 100) * figure.width; // figure % -> stage x %
  // Slot height in % of stage height: its width is % of stage width.
  const slotH = (kind: Kind) => slots[kind].width * (kind === "face" ? 1 : 4 / 3) * aspect;
  const kinds = Object.keys(slots) as Kind[];

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: String(aspect) }}>
      {/* Guide figure */}
      <div
        className="absolute inset-y-0 overflow-hidden rounded-t-full rounded-b-[1.75rem] bg-cream ring-1 ring-line"
        style={{ left: `${figure.left}%`, width: `${figure.width}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static guide image, decorative */}
        <img src={GUIDE} alt="" className="h-full w-full object-cover opacity-80 saturate-[0.55]" />
        <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-paper/90 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
          Contoh pose
        </span>
      </div>

      {/* Leader lines */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {callouts.map((c) => (
          <line
            key={c.id}
            x1={figure.left - 3.5}
            y1={c.labelY}
            x2={fx(c.at.x)}
            y2={c.at.y}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.25}
            strokeDasharray={c.status === "ok" ? undefined : "4 4"}
            className={c.status === "ok" ? "stroke-accent-deep" : c.status === "fail" ? "stroke-red-700" : "stroke-accent/60"}
          />
        ))}
        {kinds.map((k) => {
          const cy = (slots[k].top ?? 0) + slotH(k) / 2;
          const done = !!slotProps(k).photo;
          return (
            <line
              key={k}
              x1={fx(SLOTS[k].at.x)}
              y1={SLOTS[k].at.y}
              x2={slots[k].left}
              y2={cy}
              vectorEffect="non-scaling-stroke"
              strokeWidth={1.25}
              strokeDasharray={done ? undefined : "4 4"}
              className={done ? "stroke-accent-deep" : "stroke-accent/60"}
            />
          );
        })}
      </svg>

      {/* Anchor dots on the figure */}
      {[
        ...callouts.map((c) => ({ id: c.id, ...c.at, status: c.status })),
        ...kinds.map((k) => ({ id: k, ...SLOTS[k].at, status: (slotProps(k).photo ? "ok" : "idle") as Status })),
      ].map((a) => (
        <span
          key={`dot-${a.id}`}
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${fx(a.x)}%`, top: `${a.y}%` }}
        >
          {a.status === "idle" && <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />}
          <span
            className={`relative block h-full w-full rounded-full ring-2 ring-paper ${
              a.status === "ok" ? "bg-accent-deep" : a.status === "fail" ? "bg-red-700" : "bg-accent"
            }`}
          />
        </span>
      ))}

      {/* Callouts (desktop) */}
      {callouts.map((c) => (
        <div key={c.id} className="absolute -translate-y-1/2" style={{ right: `${100 - (figure.left - 3.5)}%`, top: `${c.labelY}%` }}>
          <CriterionChip text={c.text} status={c.status} />
        </div>
      ))}

      {/* Upload frames */}
      {kinds.map((k) => (
        <div key={k} className="absolute" style={{ left: `${slots[k].left}%`, top: `${slots[k].top ?? 0}%`, width: `${slots[k].width}%` }}>
          <UploadSlot {...slotProps(k)} />
        </div>
      ))}
    </div>
  );
}

function CriterionChip({ text, status }: { text: string; status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-paper px-3 py-1.5 text-xs shadow-sm transition-colors ${
        status === "ok" ? "border-accent-deep/40 text-ink" : status === "fail" ? "border-red-700/40 text-red-900" : "border-line text-muted"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full ${
          status === "ok" ? "bg-accent-deep text-paper" : status === "fail" ? "bg-red-700 text-paper" : "border border-line"
        }`}
      >
        {status === "ok" ? <Check size={10} /> : status === "fail" ? <X size={10} /> : null}
      </span>
      {text}
    </span>
  );
}

function UploadSlot({ kind, photo, checking, busy, rejected, locked, onFile }: SlotProps) {
  const slot = SLOTS[kind];
  const inputId = `photo-${kind}`;
  const disabled = locked || busy;
  return (
    <div>
      <label
        htmlFor={disabled ? undefined : inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) onFile(e.dataTransfer.files[0]);
        }}
        className={`group relative block overflow-hidden rounded-2xl bg-cream transition ${kind === "face" ? "aspect-square" : "aspect-[3/4]"} ${
          photo
            ? "shadow-[0_18px_30px_-18px_rgba(37,34,31,0.55)] ring-2 ring-accent-deep"
            : rejected
              ? "border-2 border-dashed border-red-700/50"
              : "border-2 border-dashed border-accent/50"
        } ${disabled ? "cursor-default" : "cursor-pointer hover:border-accent-deep"} ${locked ? "opacity-50" : ""}`}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the cropped photo
          <img src={photo.url} alt={`${slot.title} yang dipakai`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {checking && (
          <>
            <span className="absolute inset-0 bg-paper/50" />
            <SweepLine from="8%" to="92%" duration={1.6} className="inset-x-2 h-0.5 rounded-full bg-accent shadow-[0_0_12px_3px_rgba(154,128,96,0.6)]" />
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-accent-deep" />
            </span>
          </>
        )}
        {!photo && !checking && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-accent-deep shadow-sm transition-transform group-hover:scale-110">
              <Plus size={16} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-ink sm:text-xs">{slot.title}</span>
          </span>
        )}
        {photo && !checking && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper shadow">
            <Check size={13} />
          </span>
        )}
      </label>

      <div className="mt-1.5 flex items-center justify-between gap-1">
        <p className="truncate text-[11px] leading-tight text-muted">
          {locked ? "Setelah foto wajah" : checking ? "Memeriksa…" : photo ? slot.short : slot.purpose}
        </p>
        {photo && !busy && (
          <label htmlFor={inputId} className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-ink">
            <RefreshCw size={10} /> Ganti
          </label>
        )}
      </div>
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
    </div>
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
