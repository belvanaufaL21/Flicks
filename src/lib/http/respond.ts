import { FlowError } from "@/services/analysis.service";
import { PhotoError } from "@/lib/validation/image";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: unknown) {
  if (err instanceof FlowError) return json({ error: err.message }, err.status);
  if (err instanceof PhotoError) return json({ error: err.message }, 422);
  console.error("[api] unexpected error", err);
  return json({ error: "Terjadi kesalahan di server. Coba lagi sebentar lagi." }, 500);
}

export function tooManyRequests() {
  return json({ error: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi." }, 429);
}
