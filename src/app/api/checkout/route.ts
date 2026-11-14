import { config } from "@/lib/config";
import { errorResponse, json, tooManyRequests } from "@/lib/http/respond";
import { clientKey, rateLimit } from "@/lib/security";
import { ensureSessionHash, readReportSecret } from "@/lib/session";
import { startCheckout } from "@/services/payment.service";
import { getFlowState } from "@/services/session-state.service";

export async function POST(request: Request) {
  if (!config.paidFeaturesEnabled) return json({ error: "Pembelian sedang dihentikan sementara." }, 503);
  if (!rateLimit(`checkout:${clientKey(request)}`, 10, 60_000)) return tooManyRequests();
  try {
    const sessionHash = await ensureSessionHash();
    const payment = await startCheckout(sessionHash);
    // The new flow state rides along, so the page can move on without a second request.
    return json({
      orderId: payment.providerReference,
      status: payment.status,
      paymentUrl: payment.paymentUrl,
      state: await getFlowState(sessionHash, await readReportSecret()),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
