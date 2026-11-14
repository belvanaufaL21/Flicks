import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, Clock, FlaskConical, Info, Loader2, Lock } from "lucide-react";
import { FlowHeader } from "@/components/analyze/flow-header";
import { AutoRefresh, Countdown } from "@/components/report/report-client";
import {
  confidenceLabel,
  qualityLabel,
  seasonLabel,
  shapeImage,
  shapeLabel,
  subSeasonLabel,
  traitLabel,
} from "@/lib/labels";
import { getReport, type ReportView } from "@/services/report.service";

export const metadata: Metadata = {
  title: "Laporan Privat — FLICKS Lite",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReportPage({ params }: PageProps<"/report/[secret]">) {
  return (
    <>
      <FlowHeader />
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-3 py-32 text-muted">
              <Loader2 className="animate-spin" size={18} /> Membuka laporan…
            </div>
          }
        >
          <Report params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Report({ params }: { params: PageProps<"/report/[secret]">["params"] }) {
  await connection();
  const report = await getReport((await params).secret);

  if (report.state === "not_found") {
    return <Notice title="Laporan tidak ditemukan" body="Periksa kembali tautanmu. Tautan laporan bersifat rahasia dan harus disalin utuh." />;
  }
  if (report.state === "expired") {
    return (
      <Notice
        title="Laporan sudah kedaluwarsa"
        body="Laporan hanya bisa dibuka selama 72 jam. Foto dan hasilnya sudah dihapus dari sistem kami sesuai kebijakan privasi."
      />
    );
  }
  if (report.state === "pending") {
    return (
      <>
        <AutoRefresh />
        <Notice title="Laporan sedang disiapkan" body="Analisis masih berjalan. Halaman ini akan diperbarui otomatis." spinner />
      </>
    );
  }
  return <ReadyReport r={report} />;
}

function Notice({ title, body, spinner }: { title: string; body: string; spinner?: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-32 text-center">
      {spinner ? <Loader2 className="animate-spin text-accent-deep" /> : <Lock className="text-accent-deep" />}
      <h1 className="mt-5 font-display text-4xl text-ink">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link href="/" className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-accent-deep">
        Kembali ke beranda
      </Link>
    </div>
  );
}

type Ready = Extract<ReportView, { state: "ready" }>;

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

function ReadyReport({ r }: { r: Ready }) {
  const pc = r.personalColor;
  const bs = r.bodyShape;
  const tryonBusy = r.tryon && (r.tryon.status === "queued" || r.tryon.status === "processing");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6">
      {tryonBusy && <AutoRefresh />}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">Laporan privat</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl">
            Hasil <em className="text-accent">gayamu</em>
          </h1>
        </div>
        <div className="flex items-center gap-3 self-start rounded-full border border-line bg-paper px-4 py-2 text-sm text-muted sm:self-auto">
          <Clock size={15} className="text-accent-deep" />
          Kedaluwarsa dalam <span className="text-ink"><Countdown expiresAt={r.expiresAt} /></span>
        </div>
      </div>

      {r.demoNotes.length > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft/60 px-4 py-3 text-sm text-accent-deep">
          <FlaskConical size={18} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Mode demo:</span> {r.demoNotes.join("; ")}.
          </p>
        </div>
      )}

      {/* 1. Personal color */}
      <Section n="01" title="Personal Color">
        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <div>
            {r.facePhotoUrl && (
              <div className="relative aspect-square max-w-56 overflow-hidden rounded-[1.75rem] bg-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={r.facePhotoUrl} alt="Foto wajah yang dianalisis" className="h-full w-full object-cover" />
              </div>
            )}
            <dl className="mt-4 space-y-2 text-sm">
              {(["undertone", "depth", "contrast"] as const).map((k) => (
                <div key={k} className="flex justify-between border-b border-line/70 pb-2">
                  <dt className="text-muted">{{ undertone: "Undertone", depth: "Kedalaman", contrast: "Kontras" }[k]}</dt>
                  <dd className="font-medium text-ink">{traitLabel[pc.traits[k]]}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="text-sm text-muted">Estimasi season</p>
            <p className="font-display text-5xl text-ink">
              {seasonLabel[pc.primary_season]}
              {pc.sub_season && <span className="text-accent"> · {subSeasonLabel(pc.sub_season)}</span>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip>Keyakinan: {confidenceLabel[pc.confidence_level]}</Chip>
              {pc.status !== "completed" && <Chip warn>Perlu ditinjau</Chip>}
              {pc.alternative_candidates.map((c) => (
                <Chip key={c.season}>Alternatif: {seasonLabel[c.season]}</Chip>
              ))}
            </div>
            <p className="mt-5 leading-relaxed text-ink">{pc.summary}</p>

            <Palette title="Warna yang direkomendasikan" colors={pc.styling.recommended_colors} />
            <Palette title="Warna untuk dicoba" colors={pc.styling.colors_to_test} />
            <Palette title="Sebaiknya dihindari" colors={pc.styling.colors_to_avoid} muted />

            {pc.alternative_candidates.length > 0 && (
              <ul className="mt-6 space-y-1 text-sm text-muted">
                {pc.alternative_candidates.map((c) => (
                  <li key={c.season}>
                    <span className="font-medium text-ink">{seasonLabel[c.season]}:</span> {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* 2. Body shape */}
      <Section n="02" title="Body Shape">
        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <div className="relative aspect-[3/4] w-full max-w-56 overflow-hidden rounded-[1.75rem] bg-paper">
            {shapeImage[bs.shape] ? (
              <Image src={shapeImage[bs.shape]!} alt={`Ilustrasi bentuk ${shapeLabel[bs.shape]}`} fill sizes="220px" className="object-contain" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
                Bentuk belum dapat ditentukan dari foto
              </span>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">Estimasi bentuk tubuh</p>
            <p className="font-display text-5xl text-ink">{shapeLabel[bs.shape]}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip>Keyakinan: {confidenceLabel[bs.confidence_level]}</Chip>
              {bs.status !== "completed" && <Chip warn>Perlu ditinjau</Chip>}
              {bs.alternative_candidates.map((c) => (
                <Chip key={c.shape}>Alternatif: {shapeLabel[c.shape]}</Chip>
              ))}
            </div>
            <p className="mt-5 leading-relaxed text-ink">{bs.summary}</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <List title="Siluet untuk dicoba" items={bs.styling.silhouettes_to_try} />
              <List title="Potongan & fit" items={bs.styling.fits_to_try} />
              <List title="Perlu diperhatikan" items={bs.styling.things_to_consider} />
            </div>
          </div>
        </div>
      </Section>

      {/* 3. Virtual try-on */}
      <Section n="03" title="Virtual Try-On">
        {!r.tryon && (
          <p className="text-muted">
            Kamu belum memilih pakaian.{" "}
            <Link href="/analyze" className="font-medium text-accent-deep underline underline-offset-2">
              Pilih satu produk
            </Link>{" "}
            untuk melengkapi laporan.
          </p>
        )}
        {r.tryon && r.tryon.status !== "completed" && r.tryon.status !== "failed" && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 size={16} className="animate-spin" /> Memproses try-on untuk {r.tryon.productName}…
          </p>
        )}
        {r.tryon?.status === "failed" && (
          <p className="flex items-center gap-2 text-red-900">
            <AlertTriangle size={16} /> Try-on gagal diproses.{" "}
            <Link href="/analyze" className="underline underline-offset-2">Coba lagi</Link>
          </p>
        )}
        {r.tryon?.status === "completed" && (
          <div className="grid max-w-2xl grid-cols-[1fr_2fr] gap-4">
            <figure>
              <div className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] bg-paper">
                <Image src={r.tryon.productImage} alt={r.tryon.productName} fill sizes="200px" className="object-cover" />
              </div>
              <figcaption className="mt-2 text-xs text-muted">Produk: {r.tryon.productName}</figcaption>
            </figure>
            <figure>
              <div className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] bg-line">
                {r.tryon.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={r.tryon.imageUrl} alt={`Simulasi memakai ${r.tryon.productName}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">Gambar sudah dihapus</span>
                )}
              </div>
              <figcaption className="mt-2 text-xs text-muted">Simulasi AI · tampilan nyata bisa berbeda</figcaption>
            </figure>
          </div>
        )}
      </Section>

      {/* 4. Metadata & transparency */}
      <Section n="04" title="Transparansi">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-line bg-paper p-5 text-sm">
            <p className="font-medium text-ink">Kualitas foto</p>
            <dl className="mt-3 space-y-2">
              <Row k="Pencahayaan wajah" v={qualityLabel[pc.photo_quality.lighting]} />
              <Row k="Kejelasan foto wajah" v={qualityLabel[pc.photo_quality.image_clarity]} />
              <Row k="Badan terlihat utuh" v={bs.photo_quality.full_body_visible ? "Ya" : "Tidak"} />
              <Row k="Pose" v={qualityLabel[bs.photo_quality.pose]} />
              <Row k="Pakaian" v={qualityLabel[bs.photo_quality.clothing_fit]} />
            </dl>
            {[...pc.photo_quality.issues, ...bs.photo_quality.issues].length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-muted">
                {[...new Set([...pc.photo_quality.issues, ...bs.photo_quality.issues])].map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-[1.5rem] border border-line bg-paper p-5 text-sm">
            <p className="flex items-center gap-2 font-medium text-ink">
              <Info size={15} className="text-accent-deep" /> Tentang hasil ini
            </p>
            <p className="mt-3 leading-relaxed text-muted">{pc.disclaimer}</p>
            <dl className="mt-4 space-y-2">
              <Row k="Dibuat" v={dateFmt.format(new Date(r.createdAt))} />
              <Row k="Kedaluwarsa" v={dateFmt.format(new Date(r.expiresAt))} />
            </dl>
            <p className="mt-4 text-xs text-muted">
              Setelah kedaluwarsa, tautan ini berhenti berfungsi dan foto beserta hasilnya dihapus.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 border-t border-line pt-8">
      <div className="mb-8 flex items-baseline gap-4">
        <span className="font-mono text-xs text-accent-deep">{n}</span>
        <h2 className="font-display text-3xl text-ink sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Chip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 ${warn ? "bg-red-50 text-red-900" : "bg-accent-soft text-accent-deep"}`}>
      {children}
    </span>
  );
}

function Palette({ title, colors, muted }: { title: string; colors: { name: string; hex: string }[]; muted?: boolean }) {
  if (colors.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-ink">{title}</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {colors.map((c) => (
          <li key={c.hex + c.name} className="flex w-16 flex-col items-center gap-1.5 text-center">
            <span
              className={`h-12 w-12 rounded-full ring-1 ring-ink/10 ${muted ? "opacity-70" : ""}`}
              style={{ background: c.hex }}
            />
            <span className="text-[11px] leading-tight text-muted">{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-muted">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 pb-2">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
