"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useTransform,
} from "motion/react";
import Image from "next/image";
import { AlertTriangle, Braces, Clock, Info, Lock } from "lucide-react";
import { easeOut, fadeUp, Reveal, staggerParent } from "@/components/motion/reveal";
import { DomeSection } from "@/components/motion/shapes";
import { SectionHeading } from "./section-heading";

const tabs = [
  { id: "color", label: "Personal Color" },
  { id: "body", label: "Body Shape" },
  { id: "vto", label: "Virtual Try-On" },
  { id: "meta", label: "Transparansi" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const PHOTO = "/images/model-before.webp";
// Zoom origin (percent of the photo) used to frame the face for the color analysis.
// The photo is tall (768×1376), so it needs a strong zoom for the face to fill the stage.
const FACE = { x: 49, y: 20, zoom: 3.8 };
// For square crops (avatar, drapes): with object-top the face centre sits at 49% / 37.6%.
const FACE_SQUARE_ORIGIN = "49% 37.6%";
const zoomed = (p: number, origin: number) => origin + (p - origin) * FACE.zoom;

// Measured from public/images/model-before.webp: median of small pixel patches at
// each point, converted to CIE Lab to judge undertone, depth and contrast.
const samples = [
  { n: 1, label: "Kulit", hex: "#D1916D", note: "L* 66 · hangat", x: 47.4, y: 21.1 },
  { n: 2, label: "Rambut", hex: "#2C1D17", note: "L* 7–24", x: 41.9, y: 24.7 },
  { n: 3, label: "Mata", hex: "#2D1E15", note: "L* 7–18", x: 47.7, y: 19.0 },
  { n: 4, label: "Bibir", hex: "#A75553", note: "L* 46", x: 50.7, y: 22.2 },
];

const traits = [
  { left: "Dingin", right: "Hangat", label: "Undertone", value: 0.78 },
  { left: "Terang", right: "Gelap", label: "Kedalaman", value: 0.64 },
  { left: "Rendah", right: "Tinggi", label: "Kontras", value: 0.82 },
  { left: "Lembut", right: "Cerah", label: "Kejernihan", value: 0.44 },
];

const palette = {
  best: [
    ["Rust", "#9C4A2F"],
    ["Olive", "#6B6B2E"],
    ["Cokelat tua", "#4E3426"],
    ["Teal gelap", "#1F5A5A"],
    ["Burgundy", "#6E2A2F"],
    ["Mustard", "#C08A2B"],
    ["Hijau hutan", "#2F4A34"],
    ["Camel", "#B0875A"],
  ],
  test: [
    ["Merah bata", "#B0352B"],
    ["Petrol", "#2B4A5A"],
    ["Terong", "#4A2C40"],
    ["Ivory hangat", "#EFE4CF"],
  ],
  avoid: [
    ["Pink pastel", "#F3C6D3"],
    ["Biru es", "#CFE3F0"],
    ["Abu dingin", "#A9ADB3"],
  ],
};

// Structured output in the shape the backend expects from the analysis model (PRD §F).
const rawJson = `{
  "analysis_type": "personal_color",
  "status": "completed",
  "primary_season": "autumn",
  "sub_season": "deep_autumn",
  "alternative_candidates": ["deep_winter"],
  "confidence_level": "medium",
  "photo_quality": {
    "lighting": "acceptable",
    "image_clarity": "good"
  },
  "styling": {
    "recommended_colors": ["#9C4A2F", "#6B6B2E", "#4E3426", "#1F5A5A"],
    "colors_to_test": ["#B0352B", "#2B4A5A"]
  },
  "disclaimer": "Estimasi berbasis foto."
}`;

export function ReportPreview() {
  const [tab, setTab] = useState<TabId>("color");
  const windowRef = useRef<HTMLDivElement>(null);

  // The report window tilts up from the table to face the reader as it scrolls in.
  const { scrollYProgress } = useScroll({ target: windowRef, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const arcRotate = useTransform(scrollYProgress, [0, 1], [-30, 0]);

  return (
    <DomeSection id="hasil" className="bg-paper pt-32 pb-24 lg:pb-32">
      {/* Concentric arches framing the report */}
      <motion.div
        style={{ rotate: arcRotate }}
        className="pointer-events-none absolute left-1/2 top-[38%] h-[900px] w-[900px] -translate-x-1/2"
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute rounded-full border border-accent/25" style={{ inset: `${i * 90}px` }} />
        ))}
      </motion.div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Contoh hasil"
          title={
            <>
              Ruang ganti pribadi, <em className="text-accent">di genggaman</em>.
            </>
          }
          description="Ini laporan dari foto model kami. Warna kulit, rambut, mata, dan bibir diukur langsung dari fotonya — lalu diterjemahkan jadi palet dan panduan gaya."
        />

        <Reveal delay={0.1} className="mt-12 flex justify-center">
          <div
            role="tablist"
            aria-label="Bagian laporan"
            className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-cream p-1.5"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors sm:px-5 ${
                  tab === t.id ? "text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="report-tab"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-ink"
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <motion.div
          ref={windowRef}
          style={{ rotateX, scale, transformPerspective: 1400 }}
          className="mx-auto mt-8 max-w-5xl origin-bottom"
        >
          <div className="overflow-hidden rounded-[32px] border border-line bg-cream shadow-[0_40px_80px_-40px_rgba(37,34,31,0.35)]">
            <ReportHeader />
            <div className="grid gap-8 p-5 sm:p-8 md:grid-cols-[240px_1fr] lg:grid-cols-[270px_1fr] lg:gap-10">
              <div className="md:self-start">
                <PhotoStage mode={tab} />
              </div>
              <div className="min-h-[520px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    variants={staggerParent}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  >
                    {tab === "color" && <ColorPanel />}
                    {tab === "body" && <BodyPanel />}
                    {tab === "vto" && <TryOnPanel />}
                    {tab === "meta" && <MetaPanel />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
          <p className="mx-auto mt-4 flex max-w-2xl items-start justify-center gap-2 text-center text-xs text-muted">
            <Info size={14} className="mt-px shrink-0" />
            Contoh laporan dari foto model di atas. Warna diukur langsung dari foto; klasifikasi season dan
            body shape tetap berupa estimasi.
          </p>
        </motion.div>
      </div>
    </DomeSection>
  );
}

function ReportHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="relative h-10 w-10 overflow-hidden rounded-full bg-[#e3cfb3] ring-2 ring-accent/40">
          <Image
            src={PHOTO}
            alt=""
            fill
            sizes="400px"
            className="object-cover object-top"
            style={{ transform: "scale(3.2)", transformOrigin: FACE_SQUARE_ORIGIN }}
          />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Laporan FLICKS</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Lock size={11} /> /report/a8f3…e21c · 22 Okt 2026, 14.05 WIB
          </p>
        </div>
      </div>
      <Countdown />
    </div>
  );
}

function Countdown() {
  // Starts at a fixed value so server and client render the same markup.
  const [secs, setSecs] = useState(71 * 3600 + 59 * 60 + 59);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium tabular-nums text-accent-deep">
      <Clock size={12} />
      Kedaluwarsa {pad(Math.floor(secs / 3600))}:{pad(Math.floor((secs % 3600) / 60))}:{pad(secs % 60)}
    </span>
  );
}

/* ---------- Shared photo stage ---------- */

// One photo that changes role per tab: zooms into the face for color sampling, shows body
// measurements, turns into the before/after slider, or shows the quality checks.
function PhotoStage({ mode }: { mode: TabId }) {
  const face = mode === "color";
  const caption = {
    color: "Titik sampel warna",
    body: "Garis ukur proporsi",
    vto: "Geser untuk membandingkan",
    meta: "Pengecekan kualitas foto",
  }[mode];

  return (
    <div>
      <div className="relative mx-auto aspect-[768/1376] w-full max-w-[210px] overflow-hidden rounded-3xl md:max-w-[270px] bg-[#e3cfb3] shadow-[0_30px_60px_-30px_rgba(37,34,31,0.55)]">
        {mode === "vto" ? (
          <TryOnSlider />
        ) : (
          <>
            <motion.div
              className="absolute inset-0"
              style={{ transformOrigin: `${FACE.x}% ${FACE.y}%` }}
              animate={{ scale: face ? FACE.zoom : 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 18 }}
            >
              <Image src={PHOTO} alt="Foto model yang dianalisis" fill sizes="760px" className="object-cover" />
            </motion.div>

            <AnimatePresence>
              {face &&
                samples.map((s, i) => (
                  <motion.span
                    key={s.n}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.7 + i * 0.15 }}
                    style={{ left: `${zoomed(s.x, FACE.x)}%`, top: `${zoomed(s.y, FACE.y)}%` }}
                    className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }}
                      className="absolute inset-0 rounded-full border-2 border-paper"
                    />
                    <span
                      className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper text-[10px] font-bold text-paper shadow-md"
                      style={{ background: s.hex }}
                    >
                      {s.n}
                    </span>
                  </motion.span>
                ))}

              {mode === "body" && <BodyLines />}
              {mode === "meta" && <QualityOverlay />}
            </AnimatePresence>
          </>
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={caption}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-3 text-center text-xs text-muted"
        >
          {caption}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// Proportion lines measured from the silhouette; hips are hidden by the wide trousers.
const bodyLines = [
  { label: "Bahu", top: 28, from: 35, to: 66, measured: true },
  { label: "Pinggang", top: 41, from: 39.7, to: 60.7, measured: true },
  { label: "Pinggul", top: 52, from: 35, to: 65, measured: false },
];

function BodyLines() {
  return (
    <>
      {bodyLines.map((l, i) => (
        <motion.div
          key={l.label}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: easeOut, delay: 0.2 + i * 0.25 }}
          style={{ top: `${l.top}%`, left: `${l.from}%`, width: `${l.to - l.from}%` }}
          className="absolute flex items-center"
        >
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-accent ${l.measured ? "bg-paper" : "bg-paper/50"}`} />
          <span className={`h-0 flex-1 border-t-2 ${l.measured ? "border-paper" : "border-dashed border-paper/70"}`} />
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-accent ${l.measured ? "bg-paper" : "bg-paper/50"}`} />
          <span
            className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
              l.measured ? "bg-ink/85 text-paper" : "bg-paper text-accent-deep"
            }`}
          >
            {l.measured ? l.label : `${l.label} · tidak terlihat`}
          </span>
        </motion.div>
      ))}
    </>
  );
}

function QualityOverlay() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
      {[
        "left-3 top-10 border-l-2 border-t-2",
        "right-3 top-10 border-r-2 border-t-2",
        "left-3 bottom-3 border-b-2 border-l-2",
        "right-3 bottom-3 border-b-2 border-r-2",
      ].map((p) => (
        <span key={p} className={`absolute h-7 w-7 rounded-sm border-paper ${p}`} />
      ))}
      <motion.div
        animate={{ top: ["10%", "92%", "10%"] }}
        transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
        className="absolute inset-x-3 h-0.5 rounded-full bg-paper/90 shadow-[0_0_18px_4px_rgba(250,248,244,0.6)]"
      />
    </motion.div>
  );
}

/* ---------- Small building blocks ---------- */

function Block({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted";

function Confidence({ level }: { level: 1 | 2 | 3 }) {
  const names = ["rendah", "sedang", "tinggi"];
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: easeOut }}
            className={`h-1.5 w-7 origin-left rounded-full ${i < level ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted">Keyakinan {names[level - 1]}</span>
    </div>
  );
}

function Spectrum({ left, right, label, value, delay }: (typeof traits)[number] & { delay: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-muted">
        <span>{left}</span>
        <span className="font-semibold text-ink">{label}</span>
        <span>{right}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-line via-accent-soft to-accent/70">
        <motion.span
          initial={{ left: "50%", opacity: 0 }}
          animate={{ left: `${value * 100}%`, opacity: 1 }}
          transition={{ type: "spring", stiffness: 70, damping: 13, delay }}
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-paper bg-accent-deep shadow"
        />
      </div>
    </div>
  );
}

function SwatchRow({ colors, size }: { colors: string[][]; size: string }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map(([name, hex], i) => (
        <motion.div
          key={hex}
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.3 + i * 0.05 }}
          whileHover={{ y: -4 }}
          className="group text-center"
        >
          <span className={`block rounded-2xl shadow-sm ring-1 ring-ink/5 ${size}`} style={{ background: hex }} />
          <span className="mt-1 block text-[10px] text-muted transition-colors group-hover:text-ink">{name}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- Tabs ---------- */

function ColorPanel() {
  return (
    <div className="space-y-7">
      <Block className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrow}>Estimasi season</p>
          <p className="mt-1 font-display text-5xl text-ink sm:text-6xl">Deep Autumn</p>
          <p className="mt-1 text-sm text-muted">
            Kandidat lain: <span className="font-medium text-ink">Deep Winter</span>
          </p>
        </div>
        <Confidence level={2} />
      </Block>

      <Block>
        <p className={eyebrow}>Diukur dari foto</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {samples.map((s) => (
            <div key={s.n} className="flex items-center gap-2.5 rounded-2xl bg-paper p-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-paper"
                style={{ background: s.hex }}
              >
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink">{s.label}</span>
                <span className="block font-mono text-[10px] text-muted">{s.hex}</span>
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block className="grid gap-4 rounded-3xl bg-paper p-5 sm:grid-cols-2">
        {traits.map((t, i) => (
          <Spectrum key={t.label} {...t} delay={0.5 + i * 0.12} />
        ))}
      </Block>

      <Block className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <p className={eyebrow}>Palet terbaik</p>
            <div className="mt-2">
              <SwatchRow colors={palette.best} size="h-11 w-11" />
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className={eyebrow}>Coba dulu</p>
              <div className="mt-2">
                <SwatchRow colors={palette.test} size="h-9 w-9" />
              </div>
            </div>
            <div>
              <p className={eyebrow}>Hindari</p>
              <div className="mt-2">
                <SwatchRow colors={palette.avoid} size="h-9 w-9" />
              </div>
            </div>
          </div>
        </div>
        {/* Drape test: the same face against a best and a worst color */}
        <div className="flex gap-4 lg:flex-col">
          <Drape color="#9C4A2F" label="Rust · menyatu" good />
          <Drape color="#F3C6D3" label="Pink pastel · pucat" good={false} />
        </div>
      </Block>
    </div>
  );
}

function Drape({ color, label, good }: { color: string; label: string; good: boolean }) {
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16, delay: good ? 0.6 : 0.8 }}
        className="relative mx-auto h-24 w-24 rounded-full p-2.5 shadow-md"
        style={{ background: color }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full bg-[#e3cfb3]">
          <Image
            src={PHOTO}
            alt=""
            fill
            sizes="760px"
            className="object-cover object-top"
            style={{ transform: "scale(3.4)", transformOrigin: FACE_SQUARE_ORIGIN }}
          />
        </div>
      </motion.div>
      <p className={`mt-1.5 text-[11px] font-medium ${good ? "text-accent-deep" : "text-muted"}`}>{label}</p>
    </div>
  );
}

const shapes = [
  {
    id: "rectangle",
    name: "Rectangle",
    image: "/images/shape-rectangle.webp",
    desc: "Bahu, pinggang, dan pinggul relatif sejajar.",
    tips: ["Belt atau peplum untuk memberi kesan lekuk", "Layering dan potongan berstruktur", "Atasan dengan detail di bagian dada"],
  },
  {
    id: "pear",
    name: "Pear",
    image: "/images/shape-pear.webp",
    desc: "Pinggul lebih lebar dari bahu.",
    tips: ["Detail atau warna terang di area bahu", "Rok A-line dan celana straight", "Atasan dengan neckline lebar"],
  },
  {
    id: "hourglass",
    name: "Hourglass",
    image: "/images/shape-hourglass.webp",
    desc: "Bahu dan pinggul seimbang, pinggang terdefinisi.",
    tips: ["Wrap dress dan potongan high-waist", "Bahan yang jatuh mengikuti tubuh", "Belt di titik pinggang alami"],
  },
  {
    id: "inverted",
    name: "Inverted Triangle",
    image: "/images/shape-inverted.webp",
    desc: "Bahu lebih lebar dari pinggul.",
    tips: ["V-neck untuk memecah garis bahu", "Celana wide-leg dan rok bervolume", "Detail atau motif di bagian bawah"],
  },
];

function BodyPanel() {
  const [selected, setSelected] = useState("hourglass");
  const shape = shapes.find((s) => s.id === selected)!;

  return (
    <div className="space-y-7">
      <Block className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrow}>Estimasi body shape</p>
          <p className="mt-1 font-display text-5xl text-ink sm:text-6xl">Hourglass</p>
          <p className="mt-1 text-sm text-muted">
            Kandidat lain: <span className="font-medium text-ink">Rectangle</span>
          </p>
        </div>
        <Confidence level={1} />
      </Block>

      <Block className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "Bahu", v: "Terukur", sub: "Lebar penuh dengan lengan" },
          { k: "Pinggang", v: "0,68×", sub: "dari lebar bahu" },
          { k: "Pinggul", v: "—", sub: "Tertutup celana longgar" },
        ].map((m, i) => (
          <div key={m.k} className="rounded-2xl bg-paper p-4">
            <p className={eyebrow}>{m.k}</p>
            <p className="mt-1 font-display text-3xl text-ink">
              {i === 1 ? <CountUp to={0.68} /> : m.v}
            </p>
            <p className="text-xs text-muted">{m.sub}</p>
          </div>
        ))}
      </Block>

      <Block className="flex gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4 text-sm text-ink">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent-deep" />
        <p>
          Garis pinggul tidak terlihat jelas karena celana longgar, jadi keyakinannya rendah. Untuk hasil
          lebih akurat, foto ulang dengan bawahan yang lebih pas badan.
        </p>
      </Block>

      <Block>
        <div className="grid grid-cols-4 gap-2">
          {shapes.map((s) => {
            const isSelected = selected === s.id;
            return (
              <button key={s.id} onClick={() => setSelected(s.id)} className="group relative rounded-2xl p-1 text-left">
                {isSelected && (
                  <motion.span
                    layoutId="shape-highlight"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    className="absolute inset-0 rounded-2xl border border-accent/50 bg-paper shadow-sm"
                  />
                )}
                <span className="relative block">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-[#ede6da]">
                    <Image
                      src={s.image}
                      alt={`Dress form dengan bentuk tubuh ${s.name}`}
                      fill
                      sizes="140px"
                      className={`object-cover transition duration-500 group-hover:scale-105 ${
                        isSelected ? "" : "opacity-70 saturate-50"
                      }`}
                    />
                    {s.id === "rectangle" && (
                      <span className="absolute left-1 top-1 rounded-full bg-paper/90 px-1.5 py-0.5 text-[9px] font-medium text-muted">
                        kandidat
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-1.5 block truncate pb-1 text-center text-[11px] font-medium ${
                      isSelected ? "text-accent-deep" : "text-muted"
                    }`}
                  >
                    {s.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={shape.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: easeOut }}
            className="mt-4 rounded-2xl bg-paper p-5"
          >
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">{shape.name}:</span> {shape.desc}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {shape.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-ink">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </Block>
    </div>
  );
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, to, {
      duration: 1.2,
      ease: easeOut,
      delay: 0.4,
      onUpdate: (v) => {
        node.textContent = `${v.toFixed(2).replace(".", ",")}×`;
      },
    });
    return () => controls.stop();
  }, [to]);
  return <span ref={ref}>0,00×</span>;
}

function TryOnSlider() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const pos = useMotionValue(50);
  const clip = useTransform(pos, (v) => `inset(0 0 0 ${v}%)`);
  const left = useTransform(pos, (v) => `${v}%`);
  const [dragging, setDragging] = useState(false);
  const [value, setValue] = useState(50);

  useEffect(() => pos.on("change", (v) => setValue(Math.round(v))), [pos]);

  // A one-time sweep hints that the divider can be dragged.
  useEffect(() => {
    if (!inView) return;
    const controls = animate(pos, [50, 78, 24, 50], { duration: 2.6, ease: "easeInOut", delay: 0.3 });
    return () => controls.stop();
  }, [inView, pos]);

  const moveTo = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    pos.set(Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => dragging && moveTo(e.clientX)}
      onPointerUp={() => setDragging(false)}
      className="absolute inset-0 cursor-ew-resize touch-none select-none"
    >
      <Image src={PHOTO} alt="Foto asli" fill sizes="270px" draggable={false} className="object-cover" />
      <span className="absolute left-3 top-3 z-10 rounded-full bg-paper/90 px-2.5 py-1 text-[10px] font-medium text-ink">
        Foto asli
      </span>
      <motion.div style={{ clipPath: clip }} className="absolute inset-0">
        <Image
          src="/images/model-after.webp"
          alt="Hasil virtual try-on dengan wrap blouse dusty rose"
          fill
          sizes="270px"
          draggable={false}
          className="object-cover"
        />
        <span className="absolute right-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium text-paper">
          Hasil try-on
        </span>
      </motion.div>
      <motion.div style={{ left }} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper">
        <span
          role="slider"
          tabIndex={0}
          aria-label="Geser perbandingan sebelum dan sesudah"
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={value}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") pos.set(Math.max(5, pos.get() - 5));
            if (e.key === "ArrowRight") pos.set(Math.min(95, pos.get() + 5));
          }}
          className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-sm text-ink shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ⇆
        </span>
      </motion.div>
    </div>
  );
}

function TryOnPanel() {
  return (
    <div className="space-y-7">
      <Block>
        <p className={eyebrow}>Produk yang dicoba</p>
        <div className="mt-3 flex gap-4 rounded-3xl bg-paper p-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-[#ede6da]">
            <Image src="/images/product-wrap-blouse.webp" alt="Wrap blouse dusty rose" fill sizes="112px" className="object-cover" />
          </div>
          <div>
            <p className="font-display text-3xl text-ink">Wrap Blouse</p>
            <p className="text-sm text-muted">Satin · Dusty Rose</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-deep">
              Siluet cocok untuk Hourglass
            </p>
          </div>
        </div>
      </Block>

      <Block className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-paper p-4">
          <p className={eyebrow}>Siluet</p>
          <p className="mt-1 text-sm text-ink">
            Potongan wrap dan tali di pinggang menonjolkan pinggang yang terdefinisi.
          </p>
        </div>
        <div className="rounded-2xl bg-paper p-4">
          <p className={eyebrow}>Catatan warna</p>
          <p className="mt-1 text-sm text-ink">Dusty rose sedikit meredam kontras alamimu. Coba versi berikut:</p>
          <div className="mt-2 flex gap-2">
            {[
              ["Burgundy", "#6E2A2F"],
              ["Rust", "#9C4A2F"],
            ].map(([n, c]) => (
              <span key={n} className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-4 w-4 rounded-full" style={{ background: c }} />
                {n}
              </span>
            ))}
          </div>
        </div>
      </Block>

      <Block className="rounded-2xl border border-line p-4 text-sm text-muted">
        Simulasi try-on adalah gambaran visual. Warna dan jatuhnya bahan di dunia nyata bisa berbeda.
      </Block>
    </div>
  );
}

function MetaPanel() {
  const [showJson, setShowJson] = useState(false);
  const quality = [
    { k: "Pencahayaan", v: 0.7, note: "Cukup — sisi kanan wajah sedikit lebih terang (L* 74 vs 66)" },
    { k: "Ketajaman", v: 0.88, note: "Baik — detail wajah dan rambut jelas" },
    { k: "Latar belakang", v: 0.95, note: "Polos, tidak mengganggu warna kulit" },
    { k: "Pose", v: 0.9, note: "Tegak, menghadap kamera, badan terlihat penuh" },
  ];

  return (
    <div className="space-y-7">
      <Block className="space-y-4 rounded-3xl bg-paper p-5">
        {quality.map((q, i) => (
          <div key={q.k}>
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-semibold text-ink">{q.k}</p>
              <p className="text-xs tabular-nums text-muted">{Math.round(q.v * 100)}%</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: q.v }}
                transition={{ duration: 0.9, ease: easeOut, delay: 0.3 + i * 0.12 }}
                className="h-full origin-left rounded-full bg-accent"
              />
            </div>
            <p className="mt-1 text-xs text-muted">{q.note}</p>
          </div>
        ))}
      </Block>

      <Block className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Dibuat", "22 Okt 2026, 14.05 WIB"],
          ["Masa aktif", "72 jam sejak dibuat"],
          ["Foto", "Privat, terhapus sesuai retensi"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-paper p-4">
            <p className={eyebrow}>{k}</p>
            <p className="mt-1 text-ink">{v}</p>
          </div>
        ))}
      </Block>

      <Block className="rounded-3xl border border-line bg-paper">
        <button
          onClick={() => setShowJson((s) => !s)}
          aria-expanded={showJson}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-ink"
        >
          <span className="flex items-center gap-2">
            <Braces size={16} className="text-accent-deep" /> Lihat data terstruktur
          </span>
          <span className="text-xs text-muted">{showJson ? "Tutup" : "Buka"}</span>
        </button>
        <AnimatePresence initial={false}>
          {showJson && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="overflow-hidden border-t border-line px-5 font-mono text-[11px] leading-relaxed text-muted"
            >
              <code className="block py-4">{rawJson}</code>
            </motion.pre>
          )}
        </AnimatePresence>
      </Block>

      <Block className="flex gap-3 text-sm text-muted">
        <Info size={18} className="mt-0.5 shrink-0 text-accent-deep" />
        <p>
          Seluruh hasil adalah <strong className="text-ink">estimasi dan saran gaya</strong>, bukan diagnosis atau
          pengukuran tubuh profesional. Pencahayaan, kamera, pose, pakaian, dan latar foto memengaruhi hasil.
        </p>
      </Block>
    </div>
  );
}
