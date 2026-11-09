import { connection } from "next/server";
import { errorResponse, json } from "@/lib/http/respond";
import { readReportSecret, readSessionHash } from "@/lib/session";
import { getFlowState } from "@/services/session-state.service";

export async function GET() {
  // Per-visitor data: never prerender this at build time. Without this, the build
  // tried to and the cookie read surfaced as a logged error.
  await connection();
  try {
    return json(await getFlowState(await readSessionHash(), await readReportSecret()));
  } catch (err) {
    return errorResponse(err);
  }
}
