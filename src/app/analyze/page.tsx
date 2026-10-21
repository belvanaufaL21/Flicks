import Link from "next/link";

// Placeholder until the checkout → upload flow (WEB-02 to WEB-08) is built.
export default function AnalyzePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-deep">Segera hadir</p>
      <h1 className="mt-4 font-display text-5xl text-ink">Alur analisis sedang disiapkan</h1>
      <p className="mt-4 max-w-md text-muted">
        Checkout QRIS dan upload foto akan tersedia saat soft launch.
      </p>
      <Link href="/" className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-accent-deep">
        Kembali ke beranda
      </Link>
    </main>
  );
}
