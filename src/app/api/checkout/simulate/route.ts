import { config } from "@/lib/config";
import { errorResponse, json } from "@/lib/http/respond";
import { readSessionHash } from "@/lib/session";
import { getStore } from "@/lib/store";
import { simulatePayment } from "@/services/payment.service";

// Demo mode only. Returns 404 whenever Midtrans is configured, so it cannot be used
// to fake a payment in a real deployment (QA-09).
export async function POST() {
  if (config.midtrans.mode !== "mock") return json({ error: "Not found" }, 404);
  try {
    const sessionHash = await readSessionHash();
    const payment = sessionHash && (await getStore().latestPaymentForSession(sessionHash));
    if (!payment) return json({ error: "Belum ada transaksi." }, 404);
    await simulatePayment(payment);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
