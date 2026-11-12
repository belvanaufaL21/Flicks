import { randomBytes } from "node:crypto";
import { config, missingSettings } from "@/lib/config";
import { FlowError } from "./analysis.service";
import { createQrisPayment, fetchRemoteStatus } from "@/lib/payments/midtrans";
import { newId } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { Payment } from "@/types/domain";

const PENDING_TTL_MINUTES = 15;
const PENDING_TTL_MS = PENDING_TTL_MINUTES * 60 * 1000;

function newOrderId() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FLK-${day}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/** Reuses a usable payment for this browser, otherwise opens a new QRIS payment on Midtrans. */
export async function startCheckout(sessionHash: string): Promise<Payment> {
  // Never take money for a package that cannot be delivered in full.
  const missing = missingSettings();
  if (missing.length) {
    console.error(`[checkout] refused: missing settings ${missing.join(", ")}`);
    throw new FlowError("Pembelian belum tersedia. Coba lagi nanti.", 503);
  }
  const store = getStore();
  const existing = await store.latestPaymentForSession(sessionHash);
  if (existing) {
    const token = await store.tokenForPayment(existing.id);
    const pendingFresh =
      existing.status === "pending" && Date.now() - Date.parse(existing.createdAt) < PENDING_TTL_MS;
    if (pendingFresh || (token && token.status !== "consumed")) return existing;
  }

  if (config.freeCheckout) return startFreeCheckout(store, sessionHash);

  const orderId = newOrderId();
  const charge = await createQrisPayment(orderId, config.priceIdr, PENDING_TTL_MINUTES);
  return store.insertPayment({
    id: newId("pay"),
    provider: config.midtrans.mode === "mock" ? "mock" : "midtrans",
    providerReference: orderId,
    sessionHash,
    amount: config.priceIdr,
    currency: "IDR",
    status: "pending",
    paymentUrl: charge.paymentUrl,
    qrString: null,
    expiresAt: charge.expiresAt,
    createdAt: new Date().toISOString(),
    paidAt: null,
  });
}

/**
 * Trial mode: records a zero-cost "payment" (reference FREE-…, so it never mixes with
 * real Midtrans orders in reports) and issues its token straight away. The list price
 * is kept as the amount only because the table requires a positive amount.
 */
async function startFreeCheckout(store: ReturnType<typeof getStore>, sessionHash: string) {
  const payment = await store.insertPayment({
    id: newId("pay"),
    provider: "mock",
    providerReference: newOrderId().replace("FLK-", "FREE-"),
    sessionHash,
    amount: config.priceIdr,
    currency: "IDR",
    status: "pending",
    paymentUrl: null,
    qrString: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  });
  await store.settlePayment(payment.id, newId("tok"));
  return (await store.paymentByReference(payment.providerReference))!;
}

/**
 * Settles a payment from a status the server confirmed itself. Safe to call any
 * number of times: only the first call issues a token (QA-08).
 */
export async function applyConfirmedStatus(payment: Payment, status: Payment["status"], grossAmount: number) {
  const store = getStore();
  if (status === "paid") {
    if (grossAmount !== payment.amount) {
      console.error(`[payment] amount mismatch for ${payment.providerReference}: ${grossAmount}`);
      return;
    }
    if (await store.settlePayment(payment.id, newId("tok"))) {
      await store.logUsage({
        id: newId("use"),
        provider: payment.provider === "mock" ? "mock" : "midtrans",
        feature: "payment",
        jobId: payment.id,
        estimatedCostIdr: Math.round(payment.amount * 0.007 * 1.11),
        status: "success",
        detail: payment.providerReference,
        timestamp: new Date().toISOString(),
      });
    }
  } else if (status === "expired" || status === "failed") {
    await store.setPaymentStatus(payment.id, status);
  }
}

/** Pull-based check while the browser polls, so a missed webhook never strands a buyer. */
export async function refreshPayment(payment: Payment) {
  if (payment.status !== "pending" || payment.provider === "mock") return;
  try {
    const remote = await fetchRemoteStatus(payment.providerReference);
    await applyConfirmedStatus(payment, remote.status, remote.grossAmount);
  } catch (err) {
    console.error("[payment] status check failed", err);
  }
}

/** Demo mode only: stands in for the QRIS scan. Refused whenever Midtrans is live (QA-09). */
export async function simulatePayment(payment: Payment) {
  if (payment.provider !== "mock" || config.midtrans.mode !== "mock") {
    throw new Error("Simulated payments are only available in demo mode.");
  }
  await applyConfirmedStatus(payment, "paid", payment.amount);
}
