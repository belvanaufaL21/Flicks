"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ImagePlus, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { prepareBody, prepareFace, warmUp, type Check as PhotoCheck, type Prepared } from "@/lib/photo/prepare";
import type { FlowState } from "@/services/session-state.service";
import { ArchFrame, ErrorBox, Heading, PrimaryButton } from "./ui";

// Step 2: one section, two photos in order. Each photo is checked and cropped in the
// browser the moment it is chosen, so a photo that would fail never reaches the
// analysis. The second photo opens once the first one passes.

export type ReadyPhoto = Extract<Prepared, { ok: true }>;
export type Photos = { face: ReadyPhoto | null; body: ReadyPhoto | null };
type Kind = keyof Photos;

const STAGES: { kind: Kind; title: string; purpose: string; tips: string[]; aspect: string }[] = [
  {
    kind: "face",
    title: "Foto wajah",
    purpose: "Untuk personal color",
    tips: ["Cahaya siang dari jendela, bukan lampu kuning", "Tanpa filter dan makeup tebal", "Rambut tidak menutupi wajah"],
    aspect: "aspect-square",
  },
  {
    kind: "body",
    title: "Foto seluruh badan",
    purpose: "Untuk body shape & try-on",
    tips: ["Berdiri tegak menghadap kamera", "Terlihat dari kepala sampai kaki", "Pakaian pas badan, latar polos"],
    aspect: "aspect-[3/4]",
  },
];

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
  const [rejected, setRejected] = useState<{ kind: Kind; reason: string; checks: PhotoCheck[] } | null>(null);
  const [editing, setEditing] = useState<Kind | null>(null);
  const inputId = useId();

  // Load the detectors while the visitor reads the tips.
  useEffect(() => {
    warmUp("face");
    const t = setTimeout(() => warmUp("body"), 2500);
    return () => clearTimeout(t);
  }, []);

  const active: Kind | null = editing ?? (!photos.face ? "face" : !photos.body ? "body" : null);
  const stage = STAGES.find((s) => s.kind === (active ?? "body"))!;
  const framePhoto = active ? photos[active] : photos.body;

  async function accept(file: File | undefined) {
    if (!file || !active || checking) return;
    const kind = active;
    setChecking(kind);
    setRejected(null);
    const result = await (kind === "face" ? prepareFace(file) : prepareBody(file));
    setChecking(null);
    if (!result.ok) {
      setRejected({ kind, reason: result.reason, checks: result.checks });
      return;
    }
    const old = photos[kind];
    if (old) URL.revokeObjectURL(old.url);
    onPhotos({ ...photos, [kind]: result });
    setEditing(null);
  }

  const retake = state.analysis?.status === "needs_retake";
  const failed = state.analysis?.status === "failed";
  const ready = !!photos.face && !!photos.body && !editing;

  return (
    <div>
      <Heading eyebrow="Langkah 2 · Foto" title={<>Dua foto, <em className="text-accent">satu per satu</em>.</>}>
        Setiap foto langsung diperiksa dan dipotong otomatis begitu kamu memilihnya. Kalau belum pas, kamu akan tahu
        saat itu juga, bukan setelah analisis.
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

      <div className="mt-8 grid items-start gap-8 rounded-[2.25rem] border border-line bg-paper p-5 shadow-[0_30px_60px_-40px_rgba(37,34,31,0.45)] sm:p-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* The studio frame: shows the photo being worked on, or what to aim for. */}
        <label
          htmlFor={active ? inputId : undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            accept(e.dataTransfer.files[0]);
          }}
          className={`mx-auto block w-full max-w-[12.5rem] sm:max-w-[16rem] md:max-w-none ${active ? "cursor-pointer" : ""}`}
        >
          <ArchFrame src={framePhoto?.url ?? null} alt={`Pratinjau ${stage.title.toLowerCase()}`} className="aspect-[3/4]" scanning={!!checking}>
            {!framePhoto && !checking && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-sm text-muted">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper text-accent-deep shadow-sm">
                  <ImagePlus size={22} />
                </span>
                <span>
                  <span className="font-medium text-ink">{stage.title}</span>
                  <br />
                  ketuk atau seret foto ke sini
                </span>
              </span>
            )}
            {framePhoto && !checking && <LandmarkDots points={framePhoto.points} />}
            {checking && (
              <span className="absolute inset-x-0 bottom-5 mx-auto flex w-fit items-center gap-2 rounded-full bg-paper/95 px-4 py-2 text-xs font-medium text-ink shadow">
                <Loader2 size={13} className="animate-spin" /> Memeriksa foto…
              </span>
            )}
            {framePhoto && !checking && (
              <span className="absolute inset-x-0 bottom-5 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-paper/95 px-3.5 py-1.5 text-xs font-medium text-accent-deep shadow">
                <Check size={13} /> {active ? STAGES.find((s) => s.kind === active)!.title : "Foto seluruh badan"} siap
              </span>
            )}
          </ArchFrame>
        </label>

        <div>
          <ol className="space-y-3">
            {STAGES.map((s, i) => {
              const photo = photos[s.kind];
              const isActive = active === s.kind;
              const locked = s.kind === "body" && !photos.face && !isActive;
              return (
                <li
                  key={s.kind}
                  className={`rounded-[1.5rem] border p-4 transition-colors sm:p-5 ${
                    isActive ? "border-accent/60 bg-cream/60" : "border-line"
                  } ${locked ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
                        photo && !isActive ? "bg-accent-deep text-paper" : "border border-line text-muted"
                      }`}
                    >
                      {photo && !isActive ? <Check size={14} /> : `0${i + 1}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-2xl leading-none text-ink">{s.title}</p>
                      <p className="mt-1 text-xs text-muted">{locked ? "Terbuka setelah foto wajah siap" : s.purpose}</p>
                    </div>
                    {photo && !isActive && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                        <img src={photo.url} alt="" className={`h-12 shrink-0 rounded-xl object-cover ${s.kind === "face" ? "w-12" : "w-9"}`} />
                        <button
                          type="button"
                          onClick={() => {
                            setRejected(null);
                            setEditing(s.kind);
                          }}
                          className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-ink"
                          aria-label={`Ganti ${s.title.toLowerCase()}`}
                        >
                          <RefreshCw size={12} /> Ganti
                        </button>
                      </>
                    )}
                  </div>

                  {/* One panel at a time: the tips while active, the passed checks once done.
                      "wait" lets the old panel leave before the new one comes in. */}
                  <AnimatePresence initial={false} mode="wait">
                    {isActive ? (
                      <motion.div
                        key="open"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.4, ease: easeOut }}
                        className="overflow-hidden"
                      >
                        <ul className="mt-4 space-y-1.5 text-sm text-muted">
                          {s.tips.map((t) => (
                            <li key={t} className="flex gap-2">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                              {t}
                            </li>
                          ))}
                        </ul>

                        {rejected?.kind === s.kind && (
                          <div role="alert" className="mt-4 rounded-2xl border border-red-900/15 bg-red-50 px-4 py-3 text-sm text-red-900">
                            <p className="font-medium">{rejected.reason}</p>
                            {rejected.checks.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {rejected.checks.map((c) => (
                                  <li key={c.label} className="flex items-center gap-2 text-xs">
                                    {c.ok ? <Check size={12} className="text-emerald-700" /> : <X size={12} />}
                                    <span className={c.ok ? "text-ink/70" : ""}>{c.label}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <label
                            htmlFor={inputId}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-accent-deep ${
                              checking ? "pointer-events-none opacity-60" : ""
                            }`}
                          >
                            {checking ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                            {checking ? "Memeriksa…" : photo ? "Pilih foto lain" : "Pilih foto"}
                          </label>
                          {editing === s.kind && photos[s.kind] && (
                            <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted hover:text-ink">
                              Batal
                            </button>
                          )}
                          <span className="text-xs text-muted">JPG, PNG, WebP</span>
                        </div>
                      </motion.div>
                    ) : photo ? (
                      <motion.ul
                        key="checks"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-xs text-muted"
                      >
                        {photo.checks.map((c) => (
                          <li key={c.label} className="flex items-center gap-1">
                            <Check size={11} className="text-accent-deep" />
                            {c.label}
                          </li>
                        ))}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>

          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <AnimatePresence>
            {ready && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: easeOut }}
                className="mt-6"
              >
                <div className="rounded-[1.5rem] bg-cream/70 p-4 text-sm sm:p-5">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    <ShieldCheck size={16} className="text-accent-deep" /> Sebelum dianalisis
                  </p>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
                    <li>Yang dikirim: dua foto yang sudah dipotong di atas.</li>
                    <li>Diproses oleh Google Gemini melalui OpenRouter (analisis) dan FASHN (try-on); penyedia yang menyimpan data untuk pelatihan tidak dipakai.</li>
                    <li>Disimpan privat dan dihapus otomatis setelah 72 jam, bersama laporannya.</li>
                  </ul>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 text-ink">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-deep)]"
                    />
                    <span>Saya setuju foto saya diproses dan disimpan sementara seperti dijelaskan.</span>
                  </label>
                </div>

                {submitError && <div className="mt-4"><ErrorBox message={submitError} /></div>}

                <PrimaryButton className="mt-5 w-full" disabled={!consent} onClick={onSubmit}>
                  Mulai analisis <Sparkles size={16} />
                </PrimaryButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
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
          transition={{ delay: delay + i * 0.04, duration: 0.3 }}
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper shadow-[0_0_0_2px_rgba(111,91,64,0.55)]"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        />
      ))}
    </span>
  );
}
