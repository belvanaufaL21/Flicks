import { z } from "zod";

// Structured output contracts for the two analysis modules (PRD §F.1).
// The same schemas are sent to the model as JSON Schema and used to validate its reply.

const status = z
  .enum(["completed", "needs_review", "insufficient_evidence"])
  .describe(
    "completed: enough evidence. needs_review: some evidence but the photo has problems. insufficient_evidence: the photo cannot support an estimate.",
  );
const confidence = z.enum(["low", "medium", "high"]);
const color = z.object({
  name: z.string().describe("Color name in Indonesian, e.g. 'Hijau zaitun'"),
  // Accepts "a1b2c3" or "#a1b2c3" and stores "#A1B2C3".
  hex: z
    .string()
    .regex(/^#?[0-9A-Fa-f]{6}$/)
    .describe("Six-digit hex color, e.g. #6B6B2E")
    .transform((h) => `#${h.replace("#", "").toUpperCase()}`),
});

// A list that keeps at most `max` items. The model is told the limit; one extra item
// is trimmed instead of failing the whole (paid) analysis.
function list<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(item)
    .describe(`At most ${max} items.`)
    .transform((items) => items.slice(0, max));
}

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const SUB_SEASONS = [
  "light_spring",
  "true_spring",
  "bright_spring",
  "light_summer",
  "true_summer",
  "soft_summer",
  "soft_autumn",
  "true_autumn",
  "deep_autumn",
  "deep_winter",
  "true_winter",
  "bright_winter",
] as const;

// The model's reply. `analysis_type` is deliberately not part of it: it is a constant
// we already know, and asking for it only gave the model a field to get wrong (it
// failed validation on most first attempts). It is added after validation instead.
export const personalColorModelSchema = z.object({
  status,
  primary_season: z.enum([...SEASONS, "unknown"]),
  sub_season: z
    .enum(SUB_SEASONS)
    .nullable()
    .describe("Only when the photo clearly supports it. Otherwise null; never force a sub-season."),
  alternative_candidates: list(z.object({ season: z.enum(SEASONS), reason: z.string() }), 2),
  confidence_level: confidence,
  traits: z.object({
    undertone: z.enum(["warm", "cool", "neutral", "uncertain"]),
    depth: z.enum(["light", "medium", "deep", "uncertain"]),
    contrast: z.enum(["low", "medium", "high", "uncertain"]),
  }),
  photo_quality: z.object({
    lighting: z.enum(["good", "acceptable", "poor", "uncertain"]),
    image_clarity: z.enum(["good", "acceptable", "poor"]),
    issues: z.array(z.string()).describe("Problems found, in Indonesian. Empty when none."),
  }),
  styling: z.object({
    recommended_colors: list(color, 8),
    colors_to_test: list(color, 4),
    colors_to_avoid: list(color, 4),
  }),
  summary: z.string().describe("Two or three sentences in Indonesian for the user."),
  disclaimer: z.string(),
});

export const BODY_SHAPES = ["rectangle", "pear", "hourglass", "inverted_triangle"] as const;

export const bodyShapeModelSchema = z.object({
  status,
  shape: z.enum([...BODY_SHAPES, "unknown"]),
  alternative_candidates: list(z.object({ shape: z.enum(BODY_SHAPES), reason: z.string() }), 2),
  confidence_level: confidence,
  photo_quality: z.object({
    full_body_visible: z.boolean(),
    pose: z.enum(["good", "acceptable", "poor"]),
    clothing_fit: z.enum(["fitted", "loose", "uncertain"]),
    issues: z.array(z.string()),
  }),
  styling: z.object({
    silhouettes_to_try: list(z.string(), 5),
    fits_to_try: list(z.string(), 5),
    things_to_consider: list(z.string(), 4),
  }),
  summary: z.string().describe("Two or three sentences in Indonesian for the user."),
  disclaimer: z.string(),
});

// Stored results: the model's reply plus the constant type tag.
export const personalColorSchema = personalColorModelSchema.extend({ analysis_type: z.literal("personal_color") });
export const bodyShapeSchema = bodyShapeModelSchema.extend({ analysis_type: z.literal("body_shape") });

export type PersonalColorResult = z.output<typeof personalColorSchema>;
export type BodyShapeResult = z.output<typeof bodyShapeSchema>;

// Rules the model is told but not trusted to follow: enforce them after parsing.
export function normalizePersonalColor(r: PersonalColorResult): PersonalColorResult {
  const weak = r.confidence_level === "low" || r.primary_season === "unknown" || r.status !== "completed";
  return weak ? { ...r, sub_season: null } : r;
}

export function normalizeBodyShape(r: BodyShapeResult): BodyShapeResult {
  if (!r.photo_quality.full_body_visible && r.status === "completed") {
    return { ...r, status: "needs_review", confidence_level: "low" };
  }
  return r;
}
