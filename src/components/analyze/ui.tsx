"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { SweepLine } from "@/components/motion/shapes";

// Small building blocks shared by every step of the /analyze flow.

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Terjadi kesalahan. Coba lagi.");
  return body as T;
}

export function Heading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">{title}</h1>
      {children && <p className="mt-4 max-w-xl leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-medium underline underline-offset-2">
            Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}

export function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

/** Arch-topped photo frame, the boutique-tag shape used across the brand. */
export function ArchFrame({
  src,
  alt,
  className = "",
  scanning = false,
  children,
}: {
  src: string | null;
  alt: string;
  className?: string;
  scanning?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden rounded-t-full rounded-b-[2rem] bg-line/50 ring-1 ring-line ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob or short-lived signed URL
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(250,248,244,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(250,248,244,0.14)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <SweepLine
            from="6%"
            to="94%"
            duration={2.6}
            className="inset-x-0 h-16 -translate-y-1/2 bg-gradient-to-b from-transparent via-accent-light/35 to-transparent"
          />
          <SweepLine
            from="6%"
            to="94%"
            duration={2.6}
            className="inset-x-3 h-0.5 rounded-full bg-paper shadow-[0_0_18px_4px_rgba(201,179,143,0.75)]"
          />
        </>
      )}
      {children}
    </div>
  );
}
