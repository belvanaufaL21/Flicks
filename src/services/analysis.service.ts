import { config } from "@/lib/config";
import { analyzeBodyShape, analyzePersonalColor, type AnalysisOutput } from "@/lib/ai/analysis-ai";
import { newId, newSecret, sha256 } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { ImageInfo } from "@/lib/validation/image";
import type { Analysis } from "@/types/domain";

// Token policy for the analysis step (decision tracker #10, still to be locked):
// the token is reserved while the analysis model runs, released if the provider fails or the
// photos cannot support an estimate, and consumed only after the try-on is delivered.
// A token allows this many analysis attempts before an admin has to look at it.
export const MAX_ANALYSIS_ATTEMPTS = 3;

export class FlowError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type UploadedPhoto = { bytes: Uint8Array; info: ImageInfo };

const REJECTIONS = {
  forbidden: ["Permintaan tidak valid.", 403],
  no_token: ["Belum ada token aktif. Selesaikan pembayaran dulu.", 402],
  consumed: ["Token ini sudah dipakai.", 409],
  busy: ["Analisis untuk token ini sedang berjalan.", 409],
  attempts_exhausted: ["Batas percobaan analisis untuk token ini sudah habis. Hubungi tim FLICKS untuk bantuan.", 409],
} as const;

/**
 * Saves the photos, then reserves the token and creates the job in one atomic store
 * call (QA-06, QA-07). The report link and the photos expire together, 72 hours
 * after upload.
 */
export async function startAnalysis(args: {
  sessionHash: string;
  idempotencyKey: string;
  face: UploadedPhoto;
  body: UploadedPhoto;
}): Promise<{ analysis: Analysis; reportSecret: string | null }> {
  if (!config.paidFeaturesEnabled) throw new FlowError("Layanan analisis sedang dihentikan sementara.", 503);
  if (config.openrouter.mode === "missing") {
    throw new FlowError("Layanan analisis belum tersedia. Token kamu tidak terpakai.", 503);
  }
  const store = getStore();

  // Cheap check first, so an obviously refused request uploads nothing. The atomic
  // call below is still the one that decides.
  const payment = await store.latestPaymentForSession(args.sessionHash);
  const token = payment?.status === "paid" ? await store.tokenForPayment(payment.id) : null;
  if (!token) throw new FlowError(...REJECTIONS.no_token);
  if (token.status === "consumed") throw new FlowError(...REJECTIONS.consumed);

  const created = new Date();
  const expiresAt = new Date(created.getTime() + config.reportTtlMs).toISOString();
  const save = (kind: "face" | "body", p: UploadedPhoto) =>
    store.savePhoto({
      id: newId("pho"),
      kind,
      mime: p.info.mime,
      bytes: p.bytes,
      width: p.info.width,
      height: p.info.height,
      createdAt: created.toISOString(),
      expiresAt,
    });
  const [face, body] = await Promise.all([save("face", args.face), save("body", args.body)]);

  const reportSecret = newSecret();
  const result = await store.startAnalysis(
    {
      id: newId("ana"),
      idempotencyKey: args.idempotencyKey,
      sessionHash: args.sessionHash,
      facePhotoId: face.id,
      bodyPhotoId: body.id,
      reportSecretHash: sha256(reportSecret),
    },
    MAX_ANALYSIS_ATTEMPTS,
  );

  if (result.kind !== "created") {
    await store.deletePhotos([face.id, body.id]); // the photos just uploaded are not needed
    if (result.kind === "rejected") {
      const [message, status] = REJECTIONS[result.reason];
      throw new FlowError(message, status);
    }
    return { analysis: result.analysis, reportSecret: null };
  }
  return { analysis: { ...result.analysis, reportExpiresAt: expiresAt }, reportSecret };
}

/** Runs both analysis modules. Called from `after()` so the request returns immediately. */
export async function runAnalysis(id: string) {
  const store = getStore();
  const analysis = await store.updateAnalysis(id, { status: "processing" });
  if (!analysis) return;
  const started = Date.now();
  const provider = config.openrouter.mode === "mock" ? "mock" : "openrouter";

  // Logs the real charge OpenRouter reported. A call that failed outright reports
  // no charge, so it is logged at 0 with the error as detail.
  const log = (
    feature: "personal_color" | "body_shape",
    outcome: PromiseSettledResult<AnalysisOutput<unknown>>,
  ) => {
    const run = outcome.status === "fulfilled" ? outcome.value.run : null;
    return store.logUsage({
      id: newId("use"),
      provider,
      feature,
      jobId: id,
      estimatedCostIdr: Math.round((run?.costUsd ?? 0) * config.usdToIdr),
      status: outcome.status === "fulfilled" ? "success" : "error",
      detail:
        outcome.status === "rejected"
          ? String(outcome.reason)
          : run && `${run.model} · in ${run.inputTokens ?? "?"} / out ${run.outputTokens ?? "?"} tok · ${run.attempts} attempt(s) · $${run.costUsd ?? "?"}`,
      timestamp: new Date().toISOString(),
    });
  };

  try {
    const [face, body] = await Promise.all([store.photo(analysis.facePhotoId), store.photo(analysis.bodyPhotoId)]);
    if (!face || !body) throw new Error("Uploaded photos are missing.");

    const [colorOut, shapeOut] = await Promise.allSettled([analyzePersonalColor(face), analyzeBodyShape(body)]);
    await Promise.all([log("personal_color", colorOut), log("body_shape", shapeOut)]);
    if (colorOut.status === "rejected") throw colorOut.reason;
    if (shapeOut.status === "rejected") throw shapeOut.reason;
    const color = colorOut.value.result;
    const shape = shapeOut.value.result;

    const runs = [colorOut.value.run, shapeOut.value.run];
    const metadata = {
      provider,
      model: runs[0]?.model ?? (provider === "mock" ? "mock" : config.openrouter.model),
      durationMs: Date.now() - started,
      costUsd: runs.every((r) => r?.costUsd != null) ? runs.reduce((sum, r) => sum + (r?.costUsd ?? 0), 0) : null,
    } as const;
    const unusable = color.status === "insufficient_evidence" || shape.status === "insufficient_evidence";

    if (unusable) {
      // Ask for new photos instead of charging for an estimate the photos cannot support.
      await store.updateAnalysis(id, {
        status: "needs_retake",
        personalColor: color,
        bodyShape: shape,
        modelMetadata: metadata,
      });
      await store.deletePhotos([analysis.facePhotoId, analysis.bodyPhotoId]);
      await store.releaseToken(analysis.tokenId);
      return;
    }

    await store.updateAnalysis(id, {
      status: "completed",
      personalColor: color,
      bodyShape: shape,
      modelMetadata: metadata,
      completedAt: new Date().toISOString(),
      reportExpiresAt: new Date(Date.parse(analysis.createdAt) + config.reportTtlMs).toISOString(),
    });
  } catch (err) {
    console.error(`[analysis ${id}] failed`, err);
    await store.updateAnalysis(id, {
      status: "failed",
      error: "Layanan analisis sedang bermasalah. Token kamu tidak terpakai.",
    });
    await store.releaseToken(analysis.tokenId);
  }
}

/** Ownership check for the in-progress flow: only the browser that paid may read it. */
export async function analysisForSession(id: string, sessionHash: string) {
  const analysis = await getStore().analysis(id);
  if (!analysis || analysis.sessionHash !== sessionHash) throw new FlowError("Analisis tidak ditemukan.", 404);
  return analysis;
}
