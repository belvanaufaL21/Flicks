import { config } from "@/lib/config";
import { analyzeBodyShape, analyzePersonalColor } from "@/lib/ai/gemini";
import { newId, newSecret, sha256 } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { ImageInfo } from "@/lib/validation/image";
import type { Analysis } from "@/types/domain";

// Token policy for the analysis step (decision tracker #10, still to be locked):
// the token is reserved while Gemini runs, released if the provider fails or the
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

/** Runs both Gemini modules. Called from `after()` so the request returns immediately. */
export async function runAnalysis(id: string) {
  const store = getStore();
  const analysis = await store.updateAnalysis(id, { status: "processing" });
  if (!analysis) return;
  const started = Date.now();
  const provider = config.gemini.mode === "mock" ? "mock" : "gemini";

  const log = (feature: "personal_color" | "body_shape", ok: boolean, detail: string | null) =>
    store.logUsage({
      id: newId("use"),
      provider,
      feature,
      jobId: id,
      estimatedCostIdr: provider === "mock" ? 0 : config.estimatedCostIdr.geminiPerModule,
      status: ok ? "success" : "error",
      detail,
      timestamp: new Date().toISOString(),
    });

  try {
    const [face, body] = await Promise.all([store.photo(analysis.facePhotoId), store.photo(analysis.bodyPhotoId)]);
    if (!face || !body) throw new Error("Uploaded photos are missing.");

    const [color, shape] = await Promise.allSettled([analyzePersonalColor(face), analyzeBodyShape(body)]);
    await Promise.all([
      log("personal_color", color.status === "fulfilled", color.status === "rejected" ? String(color.reason) : null),
      log("body_shape", shape.status === "fulfilled", shape.status === "rejected" ? String(shape.reason) : null),
    ]);
    if (color.status === "rejected") throw color.reason;
    if (shape.status === "rejected") throw shape.reason;

    const metadata = { provider, model: config.gemini.model, durationMs: Date.now() - started } as const;
    const unusable =
      color.value.status === "insufficient_evidence" || shape.value.status === "insufficient_evidence";

    if (unusable) {
      // Ask for new photos instead of charging for an estimate the photos cannot support.
      await store.updateAnalysis(id, {
        status: "needs_retake",
        personalColor: color.value,
        bodyShape: shape.value,
        modelMetadata: metadata,
      });
      await store.deletePhotos([analysis.facePhotoId, analysis.bodyPhotoId]);
      await store.releaseToken(analysis.tokenId);
      return;
    }

    await store.updateAnalysis(id, {
      status: "completed",
      personalColor: color.value,
      bodyShape: shape.value,
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
