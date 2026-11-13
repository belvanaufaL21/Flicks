import { createHash } from "node:crypto";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/security";

// Midtrans with QRIS (PRD baseline). Payment starts on Midtrans Snap, limited to QRIS:
// the visitor is sent to Midtrans's page, which shows the QR code, and comes back to
// /analyze afterwards. (The Core API charge endpoint is not enabled on this merchant
// account: it answers 403 "Access denied" for every payment type.)
// The browser never decides whether a payment succeeded: the server asks Midtrans's
// status API directly or verifies a signed webhook.

export type ChargeResult = { paymentUrl: string | null; expiresAt: string | null };
export type RemoteStatus = "pending" | "paid" | "expired" | "failed";

function authHeader() {
  return `Basic ${Buffer.from(`${config.midtrans.serverKey}:`).toString("base64")}`;
}

async function midtransFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${config.midtrans.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Midtrans ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/** Opens a QRIS-only Snap transaction and returns the Midtrans payment page URL. */
export async function createQrisPayment(orderId: string, amount: number, ttlMinutes: number): Promise<ChargeResult> {
  if (config.midtrans.mode === "mock") return { paymentUrl: null, expiresAt: null };

  const res = await fetch(`${config.midtrans.snapUrl}/snap/v1/transactions`, {
    method: "POST",
    headers: { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: "flicks-token", name: "1 Token FLICKS Lite", price: amount, quantity: 1 }],
      enabled_payments: ["other_qris"],
      expiry: { unit: "minutes", duration: ttlMinutes },
      // Where Midtrans sends the visitor after paying; the page then confirms with the server.
      callbacks: { finish: `${config.appUrl}/analyze` },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.redirect_url) throw new Error(`Midtrans Snap ${res.status}: ${JSON.stringify(body)}`);
  return {
    paymentUrl: body.redirect_url,
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
}

function mapStatus(transactionStatus: string, fraudStatus?: string): RemoteStatus {
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture") return fraudStatus === "accept" ? "paid" : "pending";
  if (transactionStatus === "expire") return "expired";
  if (["deny", "cancel", "failure"].includes(transactionStatus)) return "failed";
  return "pending";
}

/** Asks Midtrans for the authoritative status. Also used to double-check webhooks. */
export async function fetchRemoteStatus(orderId: string): Promise<{ status: RemoteStatus; grossAmount: number }> {
  // Before the visitor opens QRIS on the Snap page Midtrans has no transaction yet and
  // answers status_code "404"; that maps to "pending" because transaction_status is absent.
  const body = await midtransFetch(`/v2/${encodeURIComponent(orderId)}/status`);
  return { status: mapStatus(body.transaction_status, body.fraud_status), grossAmount: Number(body.gross_amount) };
}

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key). */
export function verifyNotificationSignature(n: {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
}) {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key || !config.midtrans.serverKey) return false;
  const expected = createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + config.midtrans.serverKey)
    .digest("hex");
  return safeEqual(expected, n.signature_key);
}
