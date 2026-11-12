import { config } from "@/lib/config";
import { errorResponse, json, tooManyRequests } from "@/lib/http/respond";
import { clientKey, rateLimit } from "@/lib/security";
import { ensureSessionHash } from "@/lib/session";
import { startCheckout } from "@/services/payment.service";

export async function POST(request: Request) {
  if (!config.paidFeaturesEnabled) return json({ error: "Pembelian sedang dihentikan sementara." }, 503);
  if (!rateLimit(`checkout:${clientKey(request)}`, 10, 60_000)) return tooManyRequests();
  try {
    const payment = await startCheckout(await ensureSessionHash());
    return json({ orderId: payment.providerReference, status: payment.status, paymentUrl: payment.paymentUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
