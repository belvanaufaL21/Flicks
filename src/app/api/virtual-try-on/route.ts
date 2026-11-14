import { errorResponse, json, tooManyRequests } from "@/lib/http/respond";
import { clientKey, rateLimit } from "@/lib/security";
import { readSessionHash } from "@/lib/session";
import { FlowError } from "@/services/analysis.service";
import { startTryon } from "@/services/tryon.service";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!rateLimit(`vto:${clientKey(request)}`, 6, 60_000)) return tooManyRequests();
  try {
    const sessionHash = await readSessionHash();
    if (!sessionHash) throw new FlowError("Sesi tidak ditemukan.", 401);
    const body = await request.json().catch(() => ({}));
    const analysisId = typeof body.analysisId === "string" ? body.analysisId : "";
    const productId = typeof body.productId === "string" ? body.productId : "";
    const job = await startTryon({ sessionHash, analysisId, productId });
    return json({ id: job.id, status: job.status });
  } catch (err) {
    return errorResponse(err);
  }
}
