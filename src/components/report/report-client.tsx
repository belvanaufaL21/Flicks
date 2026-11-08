"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Live countdown to the report's expiry. Reloads once it hits zero so the server refuses access. */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => Date.parse(expiresAt) - Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      const next = Date.parse(expiresAt) - Date.now();
      setLeft(next);
      if (next <= 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, router]);

  const s = Math.max(0, Math.floor(left / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono tabular-nums" suppressHydrationWarning>
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
}

/** Re-renders the server component while something is still processing. */
export function AutoRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [everyMs, router]);
  return null;
}
