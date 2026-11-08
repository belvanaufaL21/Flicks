import { errorResponse, json } from "@/lib/http/respond";
import { readReportSecret, readSessionHash } from "@/lib/session";
import { getFlowState } from "@/services/session-state.service";

export async function GET() {
  try {
    return json(await getFlowState(await readSessionHash(), await readReportSecret()));
  } catch (err) {
    return errorResponse(err);
  }
}
