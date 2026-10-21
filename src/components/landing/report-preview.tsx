"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
} from "motion/react";
import { Clock, Info, Lock } from "lucide-react";
import { easeOut, Reveal } from "@/components/motion/reveal";
import { Figure } from "./figure";
import { SectionHeading } from "./section-heading";

const tabs = [
  { id: "color", label: "Personal Color" },
  { id: "body", label: "Body Shape" },
  { id: "vto", label: "Virtual Try-On" },
  { id: "meta", label: "Transparansi" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ReportPreview() {
  const [tab, setTab] = useState<TabId>("color");

  return (
    <section id="hasil" className="relative overflow-hidden bg-paper py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Contoh hasil"
          title={
            <>
              Ruang ganti pribadi, <em className="text-plum">di genggaman</em>.
            </>
          }
          description="Begini gambaran laporan yang kamu terima. Setiap bagian menyertakan tingkat keyakinan dan catatan kualitas foto."
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

        <Reveal delay={0.2} y={50} className="mx-auto mt-8 max-w-4xl">
          <div className="overflow-hidden rounded-[32px] border border-line bg-cream/70 shadow-[0_40px_80px_-40px_rgba(30,25,21,0.35)]">
            <div className="flex items-center justify-between gap-4 border-b border-line bg-paper/80 px-6 py-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Lock size={14} />
                <span className="hidden sm:inline">/report/</span>
                <span className="font-mono text-xs">a8f3…e21c</span>
              </div>
              <Countdown />
            </div>
            <div className="min-h-[440px] p-6 sm:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                  transition={{ duration: 0.4, ease: easeOut }}
                >
                  {tab === "color" && <ColorPanel />}
                  {tab === "body" && <BodyPanel />}
                  {tab === "vto" && <TryOnPanel />}
                  {tab === "meta" && <MetaPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted">
            <Info size={14} /> Contoh ilustrasi, bukan hasil analisis nyata.
          </p>
        </Reveal>
      </div>
    </section>
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
    <span className="flex items-center gap-1.5 rounded-full bg-plum-soft px-3 py-1 text-xs font-medium text-plum">
      <Clock size={12} />
      Kedaluwarsa {pad(Math.floor(secs / 3600))}:{pad(Math.floor((secs % 3600) / 60))}:
      {pad(secs % 60)}
    </span>
  );
}

const recommended = ["#b5835a", "#8a9a5b", "#c9a27e", "#7d5a50", "#a26769", "#6b7f6a", "#d4a373", "#8c6e54"];
const toTest = ["#5e7c8a", "#c08497", "#e0c9a6", "#9c6644"];

function Swatches({ colors, size = "h-14 w-14" }: { colors: string[]; size?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {colors.map((c, i) => (
        <motion.span
          key={c}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 * i, type: "spring", stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.12, y: -4 }}
          title={c}
          className={`${size} rounded-2xl shadow-sm ring-1 ring-ink/5`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function ColorPanel() {
  return (
    <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl bg-gradient-to-br from-sand via-rose/60 to-clay/70 p-7 text-ink">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink/60">Estimasi season</p>
        <p className="mt-3 font-display text-5xl">Soft Autumn</p>
        <div className="mt-6 space-y-2 text-sm">
          <Row label="Keyakinan" value="Sedang" />
          <Row label="Kandidat alternatif" value="Soft Summer" />
          <Row label="Pencahayaan foto" value="Cukup" />
        </div>
      </div>
      <div>
        <h4 className="font-display text-2xl text-ink">Palet yang direkomendasikan</h4>
        <p className="mt-1 text-sm text-muted">Warna hangat dan lembut dengan saturasi rendah.</p>
        <div className="mt-5">
          <Swatches colors={recommended} />
        </div>
        <h4 className="mt-8 font-display text-2xl text-ink">Warna untuk dicoba</h4>
        <p className="mt-1 text-sm text-muted">Belum pasti — coba langsung di cermin dengan cahaya alami.</p>
        <div className="mt-5">
          <Swatches colors={toTest} size="h-10 w-10" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-paper/50 px-4 py-2.5 backdrop-blur">
      <span className="text-ink/70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

const shapes = [
  {
    id: "rectangle",
    name: "Rectangle",
    widths: [30, 27, 30],
    desc: "Bahu, pinggang, dan pinggul relatif sejajar.",
    tips: ["Belt atau peplum untuk memberi kesan lekuk", "Layering dan potongan berstruktur", "Atasan dengan detail di bagian dada"],
  },
  {
    id: "pear",
    name: "Pear",
    widths: [24, 22, 37],
    desc: "Pinggul lebih lebar dari bahu.",
    tips: ["Detail atau warna terang di area bahu", "Rok A-line dan celana straight", "Atasan dengan neckline lebar"],
  },
  {
    id: "hourglass",
    name: "Hourglass",
    widths: [33, 18, 33],
    desc: "Bahu dan pinggul seimbang, pinggang terdefinisi.",
    tips: ["Wrap dress dan potongan high-waist", "Bahan yang jatuh mengikuti tubuh", "Belt di titik pinggang alami"],
  },
  {
    id: "inverted",
    name: "Inverted Triangle",
    widths: [38, 24, 24],
    desc: "Bahu lebih lebar dari pinggul.",
    tips: ["V-neck untuk memecah garis bahu", "Celana wide-leg dan rok bervolume", "Detail atau motif di bagian bawah"],
  },
];

function silhouette([s, w, h]: number[]) {
  return `M${100 - s} 24 Q100 14 ${100 + s} 24 Q${100 + s + 2} 52 ${100 + w} 78 Q${100 + h + 4} 100 ${100 + h} 120 L${100 + h * 0.8} 170 L${100 - h * 0.8} 170 L${100 - h} 120 Q${100 - h - 4} 100 ${100 - w} 78 Q${100 - s - 2} 52 ${100 - s} 24 Z`;
}

function BodyPanel() {
  const [selected, setSelected] = useState("hourglass");
  const shape = shapes.find((s) => s.id === selected)!;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shapes.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className="relative rounded-2xl p-4 text-left"
          >
            {selected === s.id && (
              <motion.span
                layoutId="shape-highlight"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className="absolute inset-0 rounded-2xl border border-plum/30 bg-paper shadow-sm"
              />
            )}
            <span className="relative block">
              <svg viewBox="40 0 120 190" className="mx-auto h-28 w-auto">
                <motion.path
                  d={silhouette(s.widths)}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: easeOut }}
                  fill={selected === s.id ? "#efe2e7" : "transparent"}
                  stroke={selected === s.id ? "#5a2941" : "#b8aaa0"}
                  strokeWidth="2"
                />
              </svg>
              <span className={`mt-2 block text-center text-sm font-medium ${selected === s.id ? "text-plum" : "text-muted"}`}>
                {s.name}
              </span>
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={shape.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: easeOut }}
          className="mt-8 grid gap-6 rounded-3xl bg-paper p-7 md:grid-cols-2"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {shape.id === "hourglass" ? "Estimasi kamu · keyakinan sedang" : "Kategori"}
            </p>
            <p className="mt-2 font-display text-4xl text-ink">{shape.name}</p>
            <p className="mt-2 text-muted">{shape.desc}</p>
          </div>
          <ul className="space-y-3">
            {shape.tips.map((t) => (
              <li key={t} className="flex gap-3 text-ink">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TryOnPanel() {
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
    <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
      <div
        ref={ref}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => dragging && moveTo(e.clientX)}
        onPointerUp={() => setDragging(false)}
        className="relative aspect-[4/5] cursor-ew-resize touch-none select-none overflow-hidden rounded-3xl bg-gradient-to-b from-plum-soft to-sand/50"
      >
        <Figure top="#cfc8bf" bottom="#4b4743" className="absolute inset-x-8 bottom-6 top-8" />
        <span className="absolute left-4 top-4 rounded-full bg-paper/80 px-3 py-1 text-xs font-medium text-ink">
          Foto kamu
        </span>
        <motion.div
          style={{ clipPath: clip }}
          className="absolute inset-0 bg-gradient-to-b from-sand/70 to-rose/40"
        >
          <Figure top="#a26769" bottom="#e8c8a0" className="absolute inset-x-8 bottom-6 top-8" />
          <span className="absolute right-4 top-4 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">
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
            className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-sm text-ink shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-plum"
          >
            ⇆
          </span>
        </motion.div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Produk dipilih</p>
        <p className="mt-2 font-display text-4xl text-ink">Wrap Blouse Dusty Rose</p>
        <p className="mt-3 leading-relaxed text-muted">
          Geser pembatas untuk membandingkan foto asli dengan simulasi. Kamu memilih satu produk
          aktif dari katalog kurasi kami.
        </p>
        <p className="mt-6 rounded-2xl border border-line bg-paper p-4 text-sm text-muted">
          Simulasi try-on adalah gambaran visual. Warna dan jatuhnya bahan di dunia nyata bisa
          berbeda.
        </p>
      </div>
    </div>
  );
}

function MetaPanel() {
  const rows = [
    ["Kualitas pencahayaan", "Cukup"],
    ["Kejelasan gambar", "Baik"],
    ["Laporan dibuat", "22 Okt 2026, 14.05 WIB"],
    ["Masa aktif", "72 jam sejak dibuat"],
    ["Penyimpanan foto", "Privat, terhapus sesuai masa retensi"],
  ];
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <dl className="divide-y divide-line rounded-3xl bg-paper px-6">
        {rows.map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, ease: easeOut }}
            className="flex items-center justify-between gap-4 py-4 text-sm"
          >
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-medium text-ink">{v}</dd>
          </motion.div>
        ))}
      </dl>
      <div className="rounded-3xl border border-rose/40 bg-rose/10 p-7">
        <p className="flex items-center gap-2 font-display text-2xl text-ink">
          <Info size={20} className="text-clay" /> Tentang hasil ini
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          Seluruh hasil adalah <strong className="text-ink">estimasi dan saran gaya</strong>, bukan
          diagnosis atau pengukuran tubuh profesional. Pencahayaan, kamera, pose, pakaian, dan latar
          belakang foto sangat memengaruhi hasil.
        </p>
      </div>
    </div>
  );
}
