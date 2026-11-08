import { errorResponse, json } from "@/lib/http/respond";
import { readSessionHash } from "@/lib/session";
import { getStore } from "@/lib/store";
import { FlowError, analysisForSession } from "@/services/analysis.service";
import { refreshTryon } from "@/services/tryon.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/virtual-try-on/[id]">) {
  try {
    const sessionHash = await readSessionHash();
    const job = await getStore().tryonJob((await ctx.params).id);
    if (!sessionHash || !job) throw new FlowError("Job tidak ditemukan.", 404);
    await analysisForSession(job.analysisId, sessionHash);
    const next = await refreshTryon(job);
    return json({ id: next.id, status: next.status, error: next.error });
  } catch (err) {
    return errorResponse(err);
  }
}
