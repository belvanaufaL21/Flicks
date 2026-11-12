import { CheckoutToIntakeFlow } from "@/components/checkout/checkout-to-intake-flow";
import Link from "next/link";

export default function AnalyzePage() {
  const clientKey =
    process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ||
    process.env.MIDTRANS_CLIENT_KEY ||
    "";
  const isProductionRaw =
    process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION ??
    process.env.MIDTRANS_IS_PRODUCTION;
  const isProduction =
    isProductionRaw !== undefined ? isProductionRaw === "true" : undefined;

  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink transition-colors"
          >
            ← Kembali ke beranda
          </Link>
          <h1 className="mt-4 font-display text-4xl text-ink">Mulai Analisis & Virtual Try-On</h1>
          <p className="mt-2 text-sm text-muted">
            Selesaikan pembayaran QRIS / GoPay Rp19.000 sekali bayar, unggah foto wajah & seluruh tubuh, dan terima laporan privat 72 jam.
          </p>
        </div>
        <CheckoutToIntakeFlow
          clientKey={clientKey}
          isProduction={isProduction}
        />
      </div>
    </main>
  );
}
