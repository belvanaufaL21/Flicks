import { json } from "@/lib/http/respond";
import { fetchRemoteStatus, verifyNotificationSignature } from "@/lib/payments/midtrans";
import { getStore } from "@/lib/store";
import { applyConfirmedStatus } from "@/services/payment.service";

// Midtrans HTTP notification. The signature proves it came from Midtrans; the status
// is then re-read from Midtrans itself before anything is issued. Repeated deliveries
// are harmless: settling an already-paid payment issues nothing (QA-08).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !verifyNotificationSignature(body)) return json({ error: "invalid signature" }, 401);

  const payment = await getStore().paymentByReference(String(body.order_id));
  if (!payment) return json({ ok: true, ignored: "unknown order" });

  try {
    const remote = await fetchRemoteStatus(payment.providerReference);
    await applyConfirmedStatus(payment, remote.status, remote.grossAmount);
    return json({ ok: true });
  } catch (err) {
    console.error("[webhook] could not confirm status", err);
    // A non-2xx response makes Midtrans retry the notification later.
    return json({ error: "status check failed" }, 502);
  }
}
