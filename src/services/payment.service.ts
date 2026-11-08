import { randomBytes } from "node:crypto";
import { config } from "@/lib/config";
import { createQrisCharge, fetchRemoteStatus } from "@/lib/payments/midtrans";
import { newId } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { Payment } from "@/types/domain";

const PENDING_TTL_MS = 15 * 60 * 1000;

function newOrderId() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FLK-${day}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/** Reuses a usable payment for this browser, otherwise opens a new QRIS charge. */
export async function startCheckout(sessionHash: string): Promise<Payment> {
  const store = getStore();
  const existing = await store.latestPaymentForSession(sessionHash);
  if (existing) {
    const token = await store.tokenForPayment(existing.id);
    const pendingFresh =
      existing.status === "pending" && Date.now() - Date.parse(existing.createdAt) < PENDING_TTL_MS;
    if (pendingFresh || (token && token.status !== "consumed")) return existing;
  }

  const orderId = newOrderId();
  const charge = await createQrisCharge(orderId, config.priceIdr);
  return store.insertPayment({
    id: newId("pay"),
    provider: config.midtrans.mode === "mock" ? "mock" : "midtrans",
    providerReference: orderId,
    sessionHash,
    amount: config.priceIdr,
    currency: "IDR",
    status: "pending",
    qrUrl: charge.qrUrl,
    qrString: charge.qrString,
    expiresAt: charge.expiresAt,
    createdAt: new Date().toISOString(),
    paidAt: null,
  });
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
