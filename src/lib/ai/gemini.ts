import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { config } from "@/lib/config";
import {
  bodyShapeSchema,
  normalizeBodyShape,
  normalizePersonalColor,
  personalColorSchema,
  type BodyShapeResult,
  type PersonalColorResult,
} from "@/lib/validation/analysis-schema";

// Gemini runs the two analysis modules (PRD §F.1). It never generates try-on images:
// that is FASHN's job alone.

type ImageInput = { bytes: Uint8Array; mime: string };

const DISCLAIMER =
  "Estimasi berbasis foto. Hasil dipengaruhi pencahayaan, kamera, pose, dan pakaian. Bukan diagnosis atau pengukuran profesional.";

const SHARED_RULES = `
Kamu adalah asisten styling untuk pengguna di Indonesia. Tulis semua teks untuk pengguna dalam Bahasa Indonesia yang ramah dan ringkas.
Aturan:
- Ini estimasi dari foto, bukan diagnosis. Jangan pernah mengklaim akurasi profesional.
- Nilai dulu kualitas foto. Jika foto gelap, buram, berfilter, terpotong, atau bukan foto orang, pakai status "insufficient_evidence" atau "needs_review" dan jelaskan masalahnya di photo_quality.issues.
- Jangan memaksakan jawaban. Bila bukti tidak cukup, gunakan "unknown" dan confidence_level "low".
- Jangan berkomentar tentang berat badan, kecantikan, atau menilai tubuh secara negatif.
- disclaimer harus berisi: "${DISCLAIMER}"
`;

const PERSONAL_COLOR_PROMPT = `${SHARED_RULES}
Tugas: estimasi personal color dari foto wajah ini.
- Amati undertone kulit, kedalaman warna rambut dan mata, serta kontras di antara keduanya.
- primary_season hanya salah satu dari spring, summer, autumn, winter, atau unknown.
- sub_season (12 sub-season) HANYA diisi bila bukti foto jelas dan confidence_level bukan "low". Selain itu null.
- Beri sampai 2 alternative_candidates bila ada season lain yang masuk akal.
- styling: warna yang direkomendasikan, warna untuk dicoba, dan warna yang sebaiknya dihindari, masing-masing dengan nama Indonesia dan kode hex.`;

const BODY_SHAPE_PROMPT = `${SHARED_RULES}
Tugas: estimasi kategori bentuk tubuh dari foto seluruh badan ini.
- Kategori yang dipakai hanya: rectangle, pear, hourglass, inverted_triangle, atau unknown.
- Bila tubuh tidak terlihat utuh dari bahu sampai kaki, atau pakaian terlalu longgar untuk melihat siluet, gunakan status "needs_review" atau "insufficient_evidence".
- styling: siluet dan potongan pakaian yang patut dicoba secara umum, dengan bahasa netral dan positif.`;

export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;
function gemini() {
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
}

async function runModule<T>(prompt: string, image: ImageInput, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.gemini.maxAttempts; attempt++) {
    try {
      const response = await gemini().models.generateContent({
        model: config.gemini.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: image.mime, data: Buffer.from(image.bytes).toString("base64") } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema),
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(60_000),
        },
      });
      const parsed = schema.safeParse(JSON.parse(response.text ?? ""));
      if (parsed.success) return parsed.data;
      lastError = new ProviderError(`Gemini output failed schema validation: ${parsed.error.message}`, true);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof ProviderError
    ? lastError
    : new ProviderError(`Gemini request failed: ${String(lastError)}`, true);
}

export async function analyzePersonalColor(face: ImageInput): Promise<PersonalColorResult> {
  if (config.gemini.mode === "mock") return mockPersonalColor();
  return normalizePersonalColor(await runModule(PERSONAL_COLOR_PROMPT, face, personalColorSchema));
}

export async function analyzeBodyShape(body: ImageInput): Promise<BodyShapeResult> {
  if (config.gemini.mode === "mock") return mockBodyShape();
  return normalizeBodyShape(await runModule(BODY_SHAPE_PROMPT, body, bodyShapeSchema));
}

// Demo results so the whole flow can be exercised without an API key. They are
// fixed, clearly labelled, and never shown when a key is configured.
const DEMO_NOTE = "Mode demo: hasil ini contoh tetap, bukan analisis foto kamu.";

async function mockPersonalColor(): Promise<PersonalColorResult> {
  await new Promise((r) => setTimeout(r, 2500));
  return {
    analysis_type: "personal_color",
    status: "completed",
    primary_season: "autumn",
    sub_season: "deep_autumn",
    alternative_candidates: [{ season: "winter", reason: "Kontras rambut dan kulit cukup tinggi." }],
    confidence_level: "medium",
    traits: { undertone: "warm", depth: "deep", contrast: "high" },
    photo_quality: { lighting: "acceptable", image_clarity: "good", issues: [DEMO_NOTE] },
    styling: {
      recommended_colors: [
        { name: "Rust", hex: "#9C4A2F" },
        { name: "Olive", hex: "#6B6B2E" },
        { name: "Cokelat tua", hex: "#4E3426" },
        { name: "Teal gelap", hex: "#1F5A5A" },
        { name: "Burgundy", hex: "#6E2A2F" },
        { name: "Mustard", hex: "#C08A2B" },
      ],
      colors_to_test: [
        { name: "Merah bata", hex: "#B0352B" },
        { name: "Petrol", hex: "#2B4A5A" },
      ],
      colors_to_avoid: [
        { name: "Pink pastel", hex: "#F3C6D3" },
        { name: "Biru es", hex: "#CFE3F0" },
      ],
    },
    summary:
      "Warna hangat dan pekat cenderung membuat wajahmu terlihat segar. Coba warna tanah dan hijau tua sebagai dasar lemari pakaian.",
    disclaimer: DISCLAIMER,
  };
}

async function mockBodyShape(): Promise<BodyShapeResult> {
  await new Promise((r) => setTimeout(r, 2000));
  return {
    analysis_type: "body_shape",
    status: "completed",
    shape: "hourglass",
    alternative_candidates: [{ shape: "pear", reason: "Garis pinggul sedikit lebih lebar dari bahu." }],
    confidence_level: "medium",
    photo_quality: { full_body_visible: true, pose: "good", clothing_fit: "fitted", issues: [DEMO_NOTE] },
    styling: {
      silhouettes_to_try: ["Wrap dress", "Atasan dengan garis pinggang jelas", "Rok A-line"],
      fits_to_try: ["Potongan yang mengikuti pinggang", "Celana high-waist"],
      things_to_consider: ["Atasan boxy bisa menyembunyikan garis pinggang"],
    },
    summary:
      "Bahu dan pinggul terlihat seimbang dengan pinggang yang jelas. Potongan yang menonjolkan pinggang biasanya cocok untuk dicoba.",
    disclaimer: DISCLAIMER,
  };
}
