import { createHash } from "node:crypto";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/security";

// Midtrans Core API with QRIS (PRD baseline). The browser never decides whether a
// payment succeeded: the server asks Midtrans directly or verifies a signed webhook.

export type ChargeResult = { qrUrl: string | null; qrString: string | null; expiresAt: string | null };
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

export async function createQrisCharge(orderId: string, amount: number): Promise<ChargeResult> {
  if (config.midtrans.mode === "mock") return { qrUrl: null, qrString: null, expiresAt: null };

  const body = await midtransFetch("/v2/charge", {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: "flicks-token", name: "1 Token FLICKS Lite", price: amount, quantity: 1 }],
    }),
  });
  const qrAction = (body.actions as { name: string; url: string }[] | undefined)?.find(
    (a) => a.name === "generate-qr-code",
  );
  return { qrUrl: qrAction?.url ?? null, qrString: body.qr_string ?? null, expiresAt: body.expiry_time ?? null };
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
