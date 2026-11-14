import { json } from "@/lib/http/respond";
import { getReport } from "@/services/report.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/report/[secret]">) {
  const report = await getReport((await ctx.params).secret);
  const status = { not_found: 404, expired: 410, pending: 202, ready: 200 }[report.state];
  return json(report, status);
}
