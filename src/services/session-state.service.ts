import { config, isDemoMode } from "@/lib/config";
import { getStore } from "@/lib/store";
import { refreshPayment } from "./payment.service";
import { refreshTryon } from "./tryon.service";

// Everything the /analyze page needs to know which step to show, derived on the
// server so a refresh or a second tab always lands on the right step.

export type FlowState = Awaited<ReturnType<typeof getFlowState>>;

export async function getFlowState(sessionHash: string | null, reportSecret: string | null) {
  const store = getStore();
  const base = {
    demo: isDemoMode(),
    paidFeaturesEnabled: config.paidFeaturesEnabled,
    priceIdr: config.priceIdr,
  };
  const first = sessionHash ? await store.latestPaymentForSession(sessionHash) : null;
  if (!first) return { ...base, payment: null, token: null, analysis: null, tryon: null, reportPath: null };

  await refreshPayment(first);
  const payment = first.status === "pending" ? (await store.latestPaymentForSession(sessionHash!))! : first;
  const tokenBefore = await store.tokenForPayment(payment.id);
  const analysis = tokenBefore ? await store.latestAnalysisForToken(tokenBefore.id) : null;

  let job = analysis ? await store.tryonJobForAnalysis(analysis.id) : null;
  if (job) job = await refreshTryon(job);
  // Finishing the try-on consumes the token, so read it again after the refresh.
  const token = tokenBefore && job ? await store.token(tokenBefore.id) : tokenBefore;

  return {
    ...base,
    payment: {
      orderId: payment.providerReference,
      status: payment.status,
      amount: payment.amount,
      qrUrl: payment.qrUrl,
      qrString: payment.qrString,
      expiresAt: payment.expiresAt,
      simulated: payment.provider === "mock",
    },
    token: token && { status: token.status, attemptsUsed: token.analysisAttempts },
    analysis: analysis && {
      id: analysis.id,
      status: analysis.status,
      error: analysis.error,
      photoIssues:
        analysis.status === "needs_retake"
          ? [...(analysis.personalColor?.photo_quality.issues ?? []), ...(analysis.bodyShape?.photo_quality.issues ?? [])]
          : [],
    },
    tryon: job && { id: job.id, status: job.status, productId: job.productId, attempts: job.attempts },
    reportPath: analysis?.status === "completed" && reportSecret ? `/report/${reportSecret}` : null,
  };
}
