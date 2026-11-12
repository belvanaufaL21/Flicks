"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Copy, Shirt, Sparkles } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import type { FlowState } from "@/services/session-state.service";
import { ArchFrame, ErrorBox, Heading, PrimaryButton, api } from "./ui";

// Step 4: the visitor's full-body photo is the stage. Tapping a piece selects it and
// "Pakaikan" dresses the photo in it; the stage then shows the result in place, with a
// before/after toggle. The package includes one try-on, so the choice locks once sent.

type Product = { id: string; name: string; brand: string; category: string; subcategory: string; image: string; silhouette: string[] };

export function TryOnStep({
  state,
  bodyUrl,
  onState,
}: {
  state: FlowState;
  bodyUrl: string | null;
  onState: (s: FlowState) => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [selected, setSelected] = useState<string | null>(state.tryon?.productId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"after" | "before">("after");

  useEffect(() => {
    api<Product[]>("/api/products").then(setProducts, (e) => setError(e.message));
  }, []);

  const job = state.tryon;
  const working = job?.status === "queued" || job?.status === "processing";
  const completed = job?.status === "completed";
  const locked = working || completed;
  const chosen = products?.find((p) => p.id === (job && job.status !== "failed" ? job.productId : selected)) ?? null;

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products ?? []) map.set(p.category, [...(map.get(p.category) ?? []), p]);
    return [...map.entries()];
  }, [products]);

  async function dress() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/virtual-try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: state.analysis!.id, productId: selected }),
      });
      onState(await api<FlowState>("/api/session"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stageSrc = completed && view === "after" ? (job?.resultPhotoUrl ?? bodyUrl) : bodyUrl;

  return (
    <div>
      <Heading
        eyebrow="Langkah 4 · Virtual Try-On"
        title={
          completed ? (
            <>
              Ini kamu dengan <em className="text-accent">{chosen?.name ?? "pilihanmu"}</em>.
            </>
          ) : (
            <>
              Pilih, lalu lihat <em className="text-accent">di tubuhmu</em>.
            </>
          )
        }
      >
        {completed
          ? "Bandingkan sebelum dan sesudah. Hasil lengkap personal color dan body shape ada di laporanmu."
          : "Ketuk satu pakaian untuk memilihnya. Paketmu berlaku untuk satu try-on, jadi pilih yang paling ingin kamu lihat."}
      </Heading>

      {job?.status === "failed" && (
        <div className="mt-6">
          <ErrorBox message="Try-on sebelumnya gagal di sisi penyedia. Kamu bisa mencoba sekali lagi." />
        </div>
      )}

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Stage */}
        <div className="mx-auto w-full max-w-[15rem] sm:max-w-sm md:sticky md:top-24">
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={stageSrc ?? "none"}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: easeOut }}
              >
                <ArchFrame src={stageSrc} alt={completed && view === "after" ? `Kamu memakai ${chosen?.name}` : "Foto seluruh badanmu"} className="aspect-[3/4]" scanning={working || busy} />
              </motion.div>
            </AnimatePresence>

            {(working || busy) && (
              <span className="absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-paper/95 px-4 py-2 text-xs font-medium text-ink shadow">
                Memakaikan {chosen?.name ?? "pakaian"}…
              </span>
            )}

            {chosen && !locked && !busy && (
              <motion.div
                key={chosen.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-paper/95 p-2 pr-4 shadow-lg"
              >
                <span className="relative h-12 w-10 overflow-hidden rounded-xl bg-cream">
                  <Image src={chosen.image} alt="" fill sizes="40px" className="object-cover" />
                </span>
                <span className="text-xs">
                  <span className="block text-muted">Dipilih</span>
                  <span className="font-medium text-ink">{chosen.name}</span>
                </span>
              </motion.div>
            )}

            {completed && (
              <div className="absolute inset-x-0 top-5 mx-auto flex w-fit rounded-full bg-paper/95 p-1 text-xs font-medium shadow">
                {(["before", "after"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-full px-3.5 py-1.5 transition-colors ${view === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                  >
                    {v === "before" ? "Sebelum" : "Sesudah"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!completed && (
            <PrimaryButton className="mt-5 w-full" busy={busy || working} disabled={!selected || locked} onClick={dress}>
              {working || busy ? "Sedang diproses…" : selected ? <>Pakaikan ke fotoku <Sparkles size={16} /></> : "Pilih pakaian dulu"}
            </PrimaryButton>
          )}
          {error && <div className="mt-4"><ErrorBox message={error} /></div>}
        </div>

        {/* Rail */}
        <div>
          {completed && <ReportCard state={state} />}

          {!products && !error && (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-[1.25rem] bg-line/50" />
              ))}
            </div>
          )}

          {groups.map(([category, items]) => (
            <section key={category} className={completed ? "mt-8" : ""}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                <Shirt size={13} /> {category}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {items.map((p) => {
                  const active = chosen?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p.id)}
                      disabled={locked || busy}
                      aria-pressed={active}
                      className={`group text-left transition ${locked && !active ? "opacity-40" : ""}`}
                    >
                      <span
                        className={`relative block aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-cream ring-1 transition ${
                          active ? "ring-2 ring-accent-deep" : "ring-line group-hover:ring-accent"
                        }`}
                      >
                        <Image src={p.image} alt={p.name} fill loading="eager" sizes="(min-width: 768px) 15vw, 30vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                        {active && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper">
                            <Check size={12} />
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 block truncate text-sm font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted">{p.subcategory}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ state }: { state: FlowState }) {
  const [copied, setCopied] = useState(false);
  const url = state.reportPath ? `${window.location.origin}${state.reportPath}` : null;
  if (!url) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="rounded-[1.75rem] bg-ink p-6 text-paper"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-light">Laporan siap</p>
      <p className="mt-2 font-display text-3xl leading-tight">Personal color, body shape, dan try-on dalam satu halaman.</p>
      <p className="mt-2 text-sm text-paper/70">Tautan rahasia ini aktif 72 jam. Simpan sebelum menutup halaman.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={state.reportPath!}
          className="inline-flex items-center gap-2 rounded-full bg-paper px-5 py-3 text-sm font-medium text-ink hover:bg-accent-soft"
        >
          Buka laporan <ArrowRight size={15} />
        </Link>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* clipboard blocked: the report link is still one click away */
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border border-paper/30 px-5 py-3 text-sm text-paper hover:bg-paper/10"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Tersalin" : "Salin tautan"}
        </button>
      </div>
    </motion.div>
  );
}
