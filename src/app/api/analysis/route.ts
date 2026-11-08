import { after } from "next/server";
import { errorResponse, json, tooManyRequests } from "@/lib/http/respond";
import { clientKey, rateLimit } from "@/lib/security";
import { readSessionHash, rememberReportSecret } from "@/lib/session";
import { PHOTO_LIMITS, PhotoError, validatePhoto } from "@/lib/validation/image";
import { FlowError, runAnalysis, startAnalysis } from "@/services/analysis.service";

export const maxDuration = 120;

async function readPhoto(form: FormData, field: string, label: string) {
  const file = form.get(field);
  if (!(file instanceof File)) throw new PhotoError(`${label} wajib diunggah.`);
  if (file.size > PHOTO_LIMITS.maxBytes) throw new PhotoError(`${label}: ukuran file lebih dari 8 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, info: validatePhoto(bytes, label) };
}

export async function POST(request: Request) {
  if (!rateLimit(`analysis:${clientKey(request)}`, 6, 60_000)) return tooManyRequests();
  try {
    const sessionHash = await readSessionHash();
    if (!sessionHash) throw new FlowError("Sesi tidak ditemukan. Mulai dari pembayaran.", 401);

    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PHOTO_LIMITS.maxBytes * 2 + 64 * 1024) throw new PhotoError("Total ukuran foto terlalu besar.");

    const form = await request.formData();
    if (form.get("consent") !== "true") {
      throw new FlowError("Persetujuan pemrosesan foto wajib dicentang.", 422);
    }
    const idempotencyKey = String(form.get("idempotencyKey") ?? "");
    if (!/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) throw new FlowError("Permintaan tidak valid.", 400);

    // Every check happens before a paid provider is called (QA-02).
    const face = await readPhoto(form, "face", "Foto wajah");
    const body = await readPhoto(form, "body", "Foto seluruh badan");

    const { analysis, reportSecret } = await startAnalysis({ sessionHash, idempotencyKey, face, body });
    if (reportSecret) {
      await rememberReportSecret(reportSecret);
      after(() => runAnalysis(analysis.id));
    }
    return json({ id: analysis.id, status: analysis.status }, reportSecret ? 201 : 200);
  } catch (err) {
    return errorResponse(err);
  }
}
