"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, Shirt, Sparkles } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import type { FlowState } from "@/services/session-state.service";
import { TagButton } from "@/components/ui/tag-button";
import { ArchFrame, ErrorBox, Heading, api } from "./ui";

// Step 4: the visitor's full-body photo is the stage. Tapping a piece selects it and
// "Pakaikan" dresses the photo in it; the stage then shows the result in place, with a
// before/after toggle. Users get a quota of 1 top and 1 bottom.

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  image: string;
  silhouette: string[];
  sourceUrl?: string | null;
};

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
  const [selectedTop, setSelectedTop] = useState<string | null>(null);
  const [selectedBottom, setSelectedBottom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"after" | "before">("after");

  useEffect(() => {
    api<Product[]>("/api/products").then((prods) => {
      setProducts(prods);
      if (state.tryon?.productId) {
        const ids = state.tryon.productId.split(",").map((s) => s.trim());
        for (const id of ids) {
          const match = prods.find((p) => p.id === id);
          if (match?.category === "Bawahan") {
            setSelectedBottom(id);
          } else {
            setSelectedTop(id);
          }
        }
      }
    }, (e) => setError(e.message));
  }, [state.tryon?.productId]);

  const job = state.tryon;
  const working = job?.status === "queued" || job?.status === "processing";
  const completed = job?.status === "completed";
  const locked = working || completed;

  const jobProductIds = useMemo(() => {
    return job && job.status !== "failed" && job.productId
      ? job.productId.split(",").map((s) => s.trim())
      : [];
  }, [job]);

  const chosenTop = useMemo(() => {
    if (jobProductIds.length > 0) {
      return products?.find((p) => jobProductIds.includes(p.id) && (p.category === "Atasan" || p.category !== "Bawahan")) ?? null;
    }
    return products?.find((p) => p.id === selectedTop) ?? null;
  }, [products, jobProductIds, selectedTop]);

  const chosenBottom = useMemo(() => {
    if (jobProductIds.length > 0) {
      return products?.find((p) => jobProductIds.includes(p.id) && p.category === "Bawahan") ?? null;
    }
    return products?.find((p) => p.id === selectedBottom) ?? null;
  }, [products, jobProductIds, selectedBottom]);

  const canTryTop = !completed || !chosenTop;
  const canTryBottom = !completed || !chosenBottom;

  const chosenItems = [chosenTop, chosenBottom].filter(Boolean) as Product[];
  const chosenNames = chosenItems.map((p) => p.name).join(" & ");
  const hasSelection = !!(selectedTop || selectedBottom);

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products ?? []) {
      const cat = p.category || "Atasan";
      map.set(cat, [...(map.get(cat) ?? []), p]);
    }
    const order: Record<string, number> = { Atasan: 1, Bawahan: 2, Terusan: 3 };
    return [...map.entries()].sort(([a], [b]) => (order[a] ?? 99) - (order[b] ?? 99));
  }, [products]);

  function toggleSelect(p: Product) {
    if (locked || busy) return;
    const isBawahan = p.category === "Bawahan";
    if (isBawahan) {
      setSelectedBottom((prev) => (prev === p.id ? null : p.id));
    } else {
      setSelectedTop((prev) => (prev === p.id ? null : p.id));
    }
  }

  function isProductActive(p: Product) {
    if (jobProductIds.length > 0) {
      return jobProductIds.includes(p.id);
    }
    return p.category === "Bawahan" ? selectedBottom === p.id : selectedTop === p.id;
  }

  async function dress() {
    if ((!selectedTop && !selectedBottom) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/virtual-try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: state.analysis!.id,
          productId: [selectedTop, selectedBottom].filter(Boolean).join(","),
          topProductId: selectedTop ?? undefined,
          bottomProductId: selectedBottom ?? undefined,
        }),
      });
      onState(await api<FlowState>("/api/session"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The result is a large image. Keep showing the body photo until it has fully loaded,
  // then swap, so the stage never sits empty. The first loaded URL is kept: later polls
  // hand out freshly signed URLs for the same image, which would reload it.
  const resultSrc = completed ? (job?.resultPhotoUrl ?? null) : null;
  const [readyResult, setReadyResult] = useState<string | null>(null);
  useEffect(() => {
    if (!resultSrc || readyResult) return;
    const img = new window.Image(); // the browser's Image, not next/image
    img.onload = img.onerror = () => setReadyResult(resultSrc);
    img.src = resultSrc;
    return () => {
      img.onload = img.onerror = null;
    };
  }, [resultSrc, readyResult]);
  const preparingResult = completed && !readyResult;
  const stageSrc = completed && view === "after" && readyResult ? readyResult : bodyUrl;

  return (
    <div>
      <Heading
        eyebrow="Langkah 4 · Virtual Try-On"
        title={
          completed ? (
            <>
              Ini kamu dengan <em className="text-accent">{chosenNames || "pilihanmu"}</em>.
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
          : "Pilih 1 atasan dan 1 bawahan (atau salah satunya saja). Virtual try-on akan langsung memakaikan pilihanmu ke fotomu."}
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
                <ArchFrame
                  src={stageSrc}
                  alt={stageSrc === readyResult ? `Kamu memakai ${chosenNames || "pakaian pilihanmu"}` : "Foto seluruh badanmu"}
                  className="aspect-[3/4]"
                  scanning={working || busy || preparingResult}
                />
              </motion.div>
            </AnimatePresence>

            {(working || busy || preparingResult) && (
              <span className="absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-paper/95 px-4 py-2 text-xs font-medium text-ink shadow">
                {preparingResult ? "Menyiapkan hasil…" : `Memakaikan ${chosenNames || "pakaian"}…`}
              </span>
            )}

            {chosenItems.length > 0 && !locked && !busy && (
              <motion.div
                key={chosenItems.map((c) => c.id).join("-")}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-paper/95 p-2 pr-4 shadow-lg"
              >
                <div className="flex -space-x-2">
                  {chosenItems.map((c) => (
                    <span key={c.id} className="relative h-12 w-10 overflow-hidden rounded-xl bg-cream ring-2 ring-paper">
                      <Image src={c.image} alt="" fill sizes="40px" className="object-cover" unoptimized={c.image.startsWith("http")} />
                    </span>
                  ))}
                </div>
                <span className="text-xs">
                  <span className="block text-muted">Dipilih ({chosenItems.length})</span>
                  <span className="font-medium text-ink max-w-[130px] truncate block">{chosenNames}</span>
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
            <div className="mt-6">
              <TagButton
                label={
                  selectedTop && selectedBottom
                    ? "Pakaikan 1 Atasan & 1 Bawahan ke fotoku"
                    : selectedTop
                    ? `Pakaikan ${chosenTop?.name ?? "Atasan"} ke fotoku`
                    : selectedBottom
                    ? `Pakaikan ${chosenBottom?.name ?? "Bawahan"} ke fotoku`
                    : "Pilih 1 atasan dan/atau 1 bawahan"
                }
                ready={hasSelection}
                busy={busy || working}
                busyLabel="Sedang memakaikan…"
                onClick={dress}
                fullWidth
              />
            </div>
          )}
          {error && <div className="mt-4"><ErrorBox message={error} /></div>}
        </div>

        {/* Rail */}
        <div>
          {completed && <ReportCard state={state} />}

          {/* Quota Badges */}
          <div className="mb-6 flex flex-wrap items-center gap-2.5 rounded-2xl bg-cream/70 p-3 ring-1 ring-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Kuota Try-On:</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                canTryTop
                  ? "bg-accent/15 text-accent-deep ring-1 ring-accent/30"
                  : "bg-paper text-muted ring-1 ring-line line-through"
              }`}
            >
              <Shirt size={12} />
              Kuota Atasan: {canTryTop ? "1/1 Tersedia" : "0/1 Terpakai"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                canTryBottom
                  ? "bg-accent/15 text-accent-deep ring-1 ring-accent/30"
                  : "bg-paper text-muted ring-1 ring-line line-through"
              }`}
            >
              <Sparkles size={12} />
              Kuota Bawahan: {canTryBottom ? "1/1 Tersedia" : "0/1 Terpakai"}
            </span>
          </div>

          {!products && !error && (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-[1.25rem] bg-line/50" />
              ))}
            </div>
          )}

          {/* Visual gap between categories: space-y-8 */}
          <div className="space-y-8">
            {groups.map(([category, items]) => {
              const isAtasan = category === "Atasan";
              const isBawahan = category === "Bawahan";
              const quotaLabel = isAtasan
                ? `Kuota: ${canTryTop ? "1/1" : "0/1"}`
                : isBawahan
                ? `Kuota: ${canTryBottom ? "1/1" : "0/1"}`
                : null;

              return (
                <section key={category}>
                  <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    <span className="flex items-center gap-2">
                      {isBawahan ? <Sparkles size={13} /> : <Shirt size={13} />} {category}
                    </span>
                    {quotaLabel && (
                      <span className="font-mono text-[11px] normal-case tracking-normal text-muted/80">
                        {quotaLabel}
                      </span>
                    )}
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {items.map((p) => {
                      const active = isProductActive(p);
                      return (
                        <div
                          key={p.id}
                          className={`group flex flex-col text-left transition ${locked && !active ? "opacity-40" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSelect(p)}
                            disabled={locked || busy}
                            aria-pressed={active}
                            className="w-full text-left focus:outline-none"
                          >
                            <span
                              className={`relative block aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-cream ring-1 transition ${
                                active ? "ring-2 ring-accent-deep" : "ring-line group-hover:ring-accent"
                              }`}
                            >
                              <Image
                                src={p.image}
                                alt={p.name}
                                fill
                                loading="eager"
                                sizes="(min-width: 768px) 15vw, 30vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                unoptimized={p.image.startsWith("http")}
                              />
                              {active && (
                                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-deep text-paper shadow-sm">
                                  <Check size={12} />
                                </span>
                              )}
                            </span>
                            <span className="mt-1.5 block truncate text-sm font-medium text-ink">{p.name}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {p.brand && p.brand !== "FLICKS" ? `${p.brand} · ${p.subcategory}` : p.subcategory}
                            </span>
                          </button>
                          {p.sourceUrl && (
                            <a
                              href={p.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-deep underline decoration-accent/40 underline-offset-2 transition-colors w-fit"
                            >
                              <span className="truncate max-w-[90px]">Beli di {p.brand && p.brand !== "FLICKS" ? p.brand : "Toko"}</span>
                              <ExternalLink size={10} className="shrink-0" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
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
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <TagButton label="Buka laporan" href={state.reportPath!} tone="paper" size="md" />
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
