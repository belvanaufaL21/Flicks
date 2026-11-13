import 'server-only';
import {
  validateBodyShapeResult,
  type AnalysisImageInput,
  type BodyShapeAnalysisResult,
  type GenderType,
} from '@/server/analysis/schemas';
import {
  callGeminiStructured,
  type GeminiStructuredCallResult,
} from '@/server/providers/gemini';

export interface RunBodyShapeOptions {
  gender?: GenderType;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  model?: string;
  apiKey?: string;
}

export function buildBodyShapePrompt(
  photoPath: string,
  gender: GenderType = 'female',
): string {
  const isMale = gender === 'male';
  const roleTitle = isMale
    ? 'asisten AI Body Shape & Menswear Styling untuk FLICKS Lite'
    : 'asisten AI Body Shape & Womenswear Styling untuk FLICKS Lite';

  const categoryUnion = isMale
    ? '"trapezoid" | "inverted_triangle" | "rectangle" | "triangle" | "oval" | "unknown"'
    : '"rectangle" | "hourglass" | "inverted_triangle" | "apple" | "pear" | "unknown"';

  const rules = isMale
    ? 'Aturan wajib: kategori terbatas pada trapezoid, inverted_triangle, rectangle, triangle, oval, atau unknown. Jika pose/pakaian/pencahayaan tidak mendukung estimasi yang meyakinkan, gunakan "category": "unknown" dan "status": "needs_review". Berikan saran potongan pakaian pria (regular/slim fit, struktur bahu, potongan celana straight/tapered, layering) dalam Bahasa Indonesia.'
    : 'Aturan wajib: kategori terbatas pada rectangle, hourglass, inverted_triangle, apple, pear, atau unknown. Jika pose/pakaian/pencahayaan tidak mendukung estimasi yang meyakinkan, gunakan "category": "unknown" dan "status": "needs_review". Berikan saran proporsi dan siluet pakaian wanita (wrap, A-line, high-waist, neckline) dalam Bahasa Indonesia.';

  return [
    `Anda adalah ${roleTitle}.`,
    `Analisis foto seluruh tubuh (${photoPath}) dan kembalikan HANYA JSON sesuai skema berikut:`,
    '{',
    '  "analysis_type": "body_shape",',
    '  "status": "completed" | "needs_review",',
    `  "category": ${categoryUnion},`,
    '  "alternative_candidates": string[],',
    '  "confidence_level": "high" | "medium" | "low",',
    '  "photo_quality": {',
    '    "lighting": "good" | "acceptable" | "poor" | "uncertain",',
    '    "image_clarity": "good" | "acceptable" | "poor" | "uncertain"',
    '  },',
    '  "styling_guidance": string[],',
    '  "limitations_note": string,',
    '  "disclaimer": string',
    '}',
    rules,
  ].join('\n');
}

export async function analyzeBodyShapeWithGemini(
  image: AnalysisImageInput,
  options: RunBodyShapeOptions = {},
): Promise<GeminiStructuredCallResult<BodyShapeAnalysisResult>> {
  return await callGeminiStructured({
    prompt: buildBodyShapePrompt(image.photoPath, options.gender),
    image,
    validate: (raw) => validateBodyShapeResult(raw, options.gender),
    ...options,
  });
}
