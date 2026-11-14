import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { downloadResult, getTryonStatus, submitTryon } from "@/lib/ai/fashn";
import { newId } from "@/lib/security";
import { getStore } from "@/lib/store";
import type { TryonJob } from "@/types/domain";
import { FlowError, analysisForSession } from "./analysis.service";

// One try-on per token. A failed provider run may be retried up to this many times in
// total; after that the token stays reserved for manual recovery (refund policy TBD).
export const MAX_TRYON_ATTEMPTS = 2;

export async function startTryon(args: { sessionHash: string; analysisId: string; productId: string }) {
  if (!config.paidFeaturesEnabled) throw new FlowError("Layanan virtual try-on sedang dihentikan sementara.", 503);
  if (config.fashn.mode === "missing") {
    throw new FlowError("Layanan virtual try-on belum tersedia. Token kamu tidak terpakai.", 503);
  }
  const store = getStore();

  const analysis = await analysisForSession(args.analysisId, args.sessionHash);
  if (analysis.status !== "completed") throw new FlowError("Analisis belum selesai.", 409);
  if (analysis.reportExpiresAt && Date.parse(analysis.reportExpiresAt) < Date.now()) {
    throw new FlowError("Laporan ini sudah kedaluwarsa.", 410);
  }

  const product = await store.product(args.productId);
  if (!product?.isActive) throw new FlowError("Produk tidak tersedia.", 404); // QA-13

  const token = await store.token(analysis.tokenId);
  if (token?.status !== "reserved") throw new FlowError("Token tidak dalam status yang benar.", 409);

  // One atomic claim, so double clicks share one job and one paid call.
  const claim = await store.claimTryon(
    {
      id: newId("vto"),
      analysisId: analysis.id,
      productId: product.id,
      idempotencyKey: `vto:${analysis.id}`,
      provider: config.fashn.mode === "mock" ? "mock" : "fashn",
      providerJobId: null,
      status: "queued",
      resultPhotoId: null,
      attempts: 1,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    },
    MAX_TRYON_ATTEMPTS,
  );
  if (claim.kind === "rejected") {
    throw new FlowError("Batas percobaan virtual try-on sudah habis. Hubungi tim FLICKS.", 409);
  }
  if (claim.kind === "existing") return claim.job;
  const job = claim.job;

  const person = await store.photo(analysis.bodyPhotoId);
  if (!person) throw new FlowError("Foto sudah dihapus sesuai kebijakan retensi.", 410);

  try {
    const garmentBytes = await readFile(path.join(process.cwd(), "public", product.imagePath));
    const providerJobId = await submitTryon({
      person,
      garment: { bytes: new Uint8Array(garmentBytes), mime: mimeFromPath(product.imagePath) },
      category: product.labels.fashnCategory,
    });
    return (await store.updateTryonJob(job.id, { providerJobId, status: "processing" }))!;
  } catch (err) {
    console.error(`[tryon ${job.id}] submit failed`, err);
    await logUsage(job, false, String(err));
    return (await store.updateTryonJob(job.id, { status: "failed", error: "Gagal memulai virtual try-on." }))!;
  }
}

// Several polls can arrive while one is still downloading the result. Kept on
// globalThis because the report page and the API routes load separate module copies.
// With more than one server instance, two instances could both store a result photo;
// the token is still consumed once, because consumeToken only moves a reserved token.
const g = globalThis as unknown as { __flicksTryonInFlight?: Map<string, Promise<TryonJob>> };
const inFlight = (g.__flicksTryonInFlight ??= new Map());

/** Advances a processing job by asking FASHN for its status. */
export function refreshTryon(job: TryonJob): Promise<TryonJob> {
  if (job.status !== "processing" || !job.providerJobId) return Promise.resolve(job);
  const running = inFlight.get(job.id);
  if (running) return running;

  const work = (async () => {
    const store = getStore();
    try {
      const status = await getTryonStatus(job.providerJobId!);
      if (status.state === "processing") return job;
      if (status.state === "failed") {
        await logUsage(job, false, status.error);
        return (await store.updateTryonJob(job.id, { status: "failed", error: "Virtual try-on gagal diproses." }))!;
      }

      const analysis = (await store.analysis(job.analysisId))!;
      const result =
        status.output.kind === "url"
          ? await downloadResult(status.output.url)
          : // Demo mode: no image is generated. Show the uploaded photo, labelled as a demo.
            (await store.photo(analysis.bodyPhotoId))!;

      const photo = await store.savePhoto({
        id: newId("pho"),
        kind: "tryon",
        mime: result.mime,
        bytes: result.bytes,
        width: 0,
        height: 0,
        createdAt: new Date().toISOString(),
        expiresAt: analysis.reportExpiresAt ?? new Date(Date.now() + config.reportTtlMs).toISOString(),
      });
      await logUsage(job, true, null);
      await store.consumeToken(analysis.tokenId); // the full package has now been delivered
      return (await store.updateTryonJob(job.id, {
        status: "completed",
        resultPhotoId: photo.id,
        completedAt: new Date().toISOString(),
      }))!;
    } catch (err) {
      // A status check that errors is not a failed job: the next poll tries again.
      console.error(`[tryon ${job.id}] status check failed`, err);
      return job;
    } finally {
      inFlight.delete(job.id);
    }
  })();
  inFlight.set(job.id, work);
  return work;
}

function logUsage(job: TryonJob, ok: boolean, detail: string | null) {
  return getStore().logUsage({
    id: newId("use"),
    provider: job.provider,
    feature: "virtual_try_on",
    jobId: job.id,
    estimatedCostIdr: job.provider === "mock" ? 0 : config.estimatedCostIdr.fashnPerOutput,
    status: ok ? "success" : "error",
    detail,
    timestamp: new Date().toISOString(),
  });
}

function mimeFromPath(p: string) {
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return "image/webp";
}
