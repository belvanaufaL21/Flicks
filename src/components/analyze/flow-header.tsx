import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function FlowHeader() {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="font-display text-2xl text-ink">FLICKS</span>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-deep">Lite</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Beranda
        </Link>
      </div>
    </header>
  );
}
