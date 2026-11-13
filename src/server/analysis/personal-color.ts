import 'server-only';
import {
  validatePersonalColorResult,
  type AnalysisImageInput,
  type PersonalColorAnalysisResult,
} from '@/server/analysis/schemas';
import {
  callGeminiStructured,
  type GeminiStructuredCallResult,
} from '@/server/providers/gemini';

export interface RunPersonalColorOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  model?: string;
  apiKey?: string;
}

export function buildPersonalColorPrompt(photoPath: string): string {
  return [
    'Anda adalah asisten AI Personal Color untuk FLICKS Lite.',
    `Analisis foto wajah (${photoPath}) dan kembalikan HANYA JSON sesuai skema berikut:`,
    '{',
    '  "analysis_type": "personal_color",',
    '  "status": "completed" | "needs_review",',
    '  "primary_season": "spring" | "summer" | "autumn" | "winter" | "unknown",',
    '  "sub_season": string | null,',
    '  "alternative_candidates": string[],',
    '  "confidence_level": "high" | "medium" | "low",',
    '  "photo_quality": {',
    '    "lighting": "good" | "acceptable" | "poor" | "uncertain",',
    '    "image_clarity": "good" | "acceptable" | "poor" | "uncertain"',
    '  },',
    '  "styling": {',
    '    "recommended_colors": string[],',
    '    "colors_to_test": string[]',
    '  },',
    '  "recommended_colors": string[],',
    '  "disclaimer": string',
    '}',
    'Aturan wajib: jika pencahayaan gelap/tidak jelas atau bukti visual kurang, jangan memaksakan musim tertentu—gunakan "primary_season": "unknown", "sub_season": null, "status": "needs_review", dan cantumkan kandidat alternatif bila ada.',
  ].join('\n');
}

export async function analyzePersonalColorWithGemini(
  image: AnalysisImageInput,
  options: RunPersonalColorOptions = {},
): Promise<GeminiStructuredCallResult<PersonalColorAnalysisResult>> {
  return await callGeminiStructured({
    prompt: buildPersonalColorPrompt(image.photoPath),
    image,
    validate: validatePersonalColorResult,
    ...options,
  });
}
