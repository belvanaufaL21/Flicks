import { isDemoMode } from "@/lib/config";
import { sha256, signedMediaUrl } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { Analysis } from "@/types/domain";
import { refreshTryon } from "./tryon.service";

export type ReportView =
  | { state: "not_found" }
  | { state: "expired" }
  | { state: "pending"; status: Analysis["status"] }
  | {
      state: "ready";
      demo: boolean;
      createdAt: string;
      expiresAt: string;
      personalColor: NonNullable<Analysis["personalColor"]>;
      bodyShape: NonNullable<Analysis["bodyShape"]>;
      facePhotoUrl: string | null;
      tryon:
        | null
        | { status: "queued" | "processing" | "failed"; productName: string }
        | { status: "completed"; productName: string; imageUrl: string | null; productImage: string };
    };

/** Opens a report by its secret link. Access is refused once the 72 hours are up (QA-10). */
export async function getReport(secret: string): Promise<ReportView> {
  const store = getStore();
  await store.purgeExpiredPhotos();
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return { state: "not_found" };

  const analysis = await store.analysisBySecretHash(sha256(secret));
  if (!analysis) return { state: "not_found" };
  if (analysis.status !== "completed" || !analysis.personalColor || !analysis.bodyShape) {
    return { state: "pending", status: analysis.status };
  }
  if (!analysis.reportExpiresAt || Date.parse(analysis.reportExpiresAt) <= Date.now()) {
    await store.deletePhotos([analysis.facePhotoId, analysis.bodyPhotoId]);
    return { state: "expired" };
  }

  let job = await store.tryonJobForAnalysis(analysis.id);
  if (job) job = await refreshTryon(job);
  const [product, face, result] = await Promise.all([
    job ? store.product(job.productId) : null,
    store.photoMeta(analysis.facePhotoId),
    job?.resultPhotoId ? store.photoMeta(job.resultPhotoId) : null,
  ]);

  let tryon: Extract<ReportView, { state: "ready" }>["tryon"] = null;
  if (job && product) {
    tryon =
      job.status === "completed"
        ? {
            status: "completed",
            productName: product.name,
            productImage: product.imagePath,
            imageUrl: result ? signedMediaUrl(result.id) : null,
          }
        : { status: job.status, productName: product.name };
  }

  return {
    state: "ready",
    demo: isDemoMode() || analysis.modelMetadata?.provider === "mock",
    createdAt: analysis.completedAt ?? analysis.createdAt,
    expiresAt: analysis.reportExpiresAt,
    personalColor: analysis.personalColor,
    bodyShape: analysis.bodyShape,
    facePhotoUrl: face ? signedMediaUrl(face.id) : null,
    tryon,
  };
}
