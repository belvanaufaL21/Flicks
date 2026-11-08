import { errorResponse, json } from "@/lib/http/respond";
import { readSessionHash } from "@/lib/session";
import { FlowError, analysisForSession } from "@/services/analysis.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/analysis/[id]">) {
  try {
    const sessionHash = await readSessionHash();
    if (!sessionHash) throw new FlowError("Analisis tidak ditemukan.", 404);
    const a = await analysisForSession((await ctx.params).id, sessionHash);
    return json({ id: a.id, status: a.status, error: a.error });
  } catch (err) {
    return errorResponse(err);
  }
}
