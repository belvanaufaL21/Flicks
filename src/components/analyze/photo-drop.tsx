"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";

// Browser-side copy of the server limits in src/lib/validation/image.ts. These checks
// only save the user a round trip; the server repeats every one of them.
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_SHORT_SIDE = 512;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function checkPhoto(file: File): Promise<string | null> {
  if (!TYPES.includes(file.type)) return "Format harus JPG, PNG, atau WebP.";
  if (file.size > MAX_BYTES) return "Ukuran file maksimal 8 MB.";
  try {
    const bitmap = await createImageBitmap(file);
    const short = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    if (short < MIN_SHORT_SIDE) return `Resolusi terlalu kecil. Minimal ${MIN_SHORT_SIDE} px di sisi terpendek.`;
  } catch {
    return "File tidak bisa dibaca sebagai gambar.";
  }
  return null;
}

type Props = {
  label: string;
  hint: string;
  tips: string[];
  aspect: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

export function PhotoDrop({ label, hint, tips, aspect, file, onChange, disabled }: Props) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function accept(f: File | undefined) {
    if (!f) return;
    const problem = await checkPhoto(f);
    setError(problem);
    onChange(problem ? null : f);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-ink">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>

      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={`relative mt-3 flex ${aspect} w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed transition-colors ${
          dragging ? "border-accent bg-accent-soft/60" : "border-line bg-paper hover:border-accent"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt={`Pratinjau ${label.toLowerCase()}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-3 px-6 text-center text-sm text-muted">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
              <ImagePlus size={20} />
            </span>
            <span>
              <span className="font-medium text-ink">Pilih foto</span> atau seret ke sini
            </span>
            <span className="text-xs">JPG, PNG, WebP · maks 8 MB</span>
          </span>
        )}
        <input
          id={id}
          type="file"
          accept={TYPES.join(",")}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {file && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
        >
          <X size={12} /> Ganti foto
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}

      <ul className="mt-3 space-y-1 text-xs text-muted">
        {tips.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
