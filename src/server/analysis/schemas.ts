import 'server-only';
import type { SupportedPhotoMimeType } from '@/shared/photo-policy';
import {
  type GenderType,
  type BodyShapeCategory,
  MALE_BODY_SHAPES,
  FEMALE_BODY_SHAPES,
  VALID_CATEGORIES,
  BODY_SHAPE_LABELS,
} from '@/shared/body-shape-labels';

export {
  type GenderType,
  type BodyShapeCategory,
  MALE_BODY_SHAPES,
  FEMALE_BODY_SHAPES,
  VALID_CATEGORIES,
  BODY_SHAPE_LABELS,
};

export type AnalysisFeatureType = 'personal_color' | 'body_shape';
export type AnalysisOutcomeStatus = 'completed' | 'needs_review';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type PhotoQualityRating = 'good' | 'acceptable' | 'poor' | 'uncertain';

export type PrimarySeason =
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'unknown';

export interface PhotoQualityAssessment {
  lighting: PhotoQualityRating;
  image_clarity: PhotoQualityRating;
}

export interface AnalysisImageInput {
  photoPath: string;
  bytes?: Uint8Array;
  mimeType?: SupportedPhotoMimeType;
}

export interface PersonalColorAnalysisRequest {
  analysis_type: 'personal_color';
  image: AnalysisImageInput;
}

export interface BodyShapeAnalysisRequest {
  analysis_type: 'body_shape';
  image: AnalysisImageInput;
  gender?: GenderType;
}

export interface PersonalColorAnalysisResult {
  analysis_type?: 'personal_color';
  status?: AnalysisOutcomeStatus;
  primary_season: PrimarySeason;
  sub_season: string | null;
  alternative_candidates?: string[];
  confidence_level: ConfidenceLevel;
  photo_quality?: PhotoQualityAssessment;
  styling?: {
    recommended_colors: string[];
    colors_to_test: string[];
  };
  recommended_colors: string[];
  disclaimer?: string;
}

export interface BodyShapeAnalysisResult {
  analysis_type?: 'body_shape';
  status?: AnalysisOutcomeStatus;
  category: BodyShapeCategory;
  alternative_candidates?: string[];
  confidence_level: ConfidenceLevel;
  photo_quality?: PhotoQualityAssessment;
  styling_guidance: string[];
  limitations_note?: string;
  disclaimer?: string;
}

export interface AnalysisResultPayload {
  personal_color: PersonalColorAnalysisResult;
  body_shape: BodyShapeAnalysisResult;
}

const VALID_SEASONS: readonly PrimarySeason[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'unknown',
];

const VALID_CONFIDENCE: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];

const VALID_PHOTO_QUALITY: readonly PhotoQualityRating[] = [
  'good',
  'acceptable',
  'poor',
  'uncertain',
];

const DEFAULT_DISCLAIMER =
  'Estimasi berbasis foto dan AI; dipengaruhi pencahayaan, pose, pakaian, serta latar belakang, dan bukan diagnosis profesional.';

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

export function parsePhotoQuality(raw: unknown): PhotoQualityAssessment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.lighting !== 'string' ||
    !VALID_PHOTO_QUALITY.includes(obj.lighting as PhotoQualityRating) ||
    typeof obj.image_clarity !== 'string' ||
    !VALID_PHOTO_QUALITY.includes(obj.image_clarity as PhotoQualityRating)
  ) {
    return null;
  }

  return {
    lighting: obj.lighting as PhotoQualityRating,
    image_clarity: obj.image_clarity as PhotoQualityRating,
  };
}

export function isNonConclusivePhotoQuality(
  quality?: PhotoQualityAssessment,
): boolean {
  if (!quality) {
    return false;
  }
  return (
    quality.lighting === 'poor' ||
    quality.lighting === 'uncertain' ||
    quality.image_clarity === 'poor' ||
    quality.image_clarity === 'uncertain'
  );
}

export function validatePersonalColorResult(
  raw: unknown,
): PersonalColorAnalysisResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.primary_season !== 'string' ||
    !VALID_SEASONS.includes(obj.primary_season as PrimarySeason) ||
    (obj.sub_season !== null &&
      obj.sub_season !== undefined &&
      typeof obj.sub_season !== 'string') ||
    typeof obj.confidence_level !== 'string' ||
    !VALID_CONFIDENCE.includes(obj.confidence_level as ConfidenceLevel)
  ) {
    return null;
  }

  const stylingObj =
    obj.styling && typeof obj.styling === 'object'
      ? (obj.styling as Record<string, unknown>)
      : null;

  const recommendedColors = isStringArray(obj.recommended_colors)
    ? obj.recommended_colors
    : stylingObj && isStringArray(stylingObj.recommended_colors)
      ? stylingObj.recommended_colors
      : null;

  if (!recommendedColors) {
    return null;
  }

  const colorsToTest =
    stylingObj && isStringArray(stylingObj.colors_to_test)
      ? stylingObj.colors_to_test
      : [];

  if (
    obj.alternative_candidates !== undefined &&
    !isStringArray(obj.alternative_candidates)
  ) {
    return null;
  }

  let photoQuality: PhotoQualityAssessment | undefined;
  if (obj.photo_quality !== undefined) {
    const parsedQuality = parsePhotoQuality(obj.photo_quality);
    if (!parsedQuality) {
      return null;
    }
    photoQuality = parsedQuality;
  }

  const primarySeason = obj.primary_season as PrimarySeason;
  const confidenceLevel = obj.confidence_level as ConfidenceLevel;
  const needsReview =
    obj.status === 'needs_review' ||
    primarySeason === 'unknown' ||
    confidenceLevel === 'low' ||
    isNonConclusivePhotoQuality(photoQuality);

  // Never force a sub_season when primary_season is unknown
  const subSeason =
    primarySeason === 'unknown' ? null : ((obj.sub_season as string | null) ?? null);

  return {
    analysis_type: 'personal_color',
    status: needsReview ? 'needs_review' : 'completed',
    primary_season: primarySeason,
    sub_season: subSeason,
    alternative_candidates: obj.alternative_candidates ?? [],
    confidence_level: confidenceLevel,
    photo_quality: photoQuality ?? {
      lighting: needsReview ? 'uncertain' : 'acceptable',
      image_clarity: needsReview ? 'uncertain' : 'acceptable',
    },
    styling: {
      recommended_colors: recommendedColors,
      colors_to_test: colorsToTest,
    },
    recommended_colors: recommendedColors,
    disclaimer:
      typeof obj.disclaimer === 'string' && obj.disclaimer.trim()
        ? obj.disclaimer
        : DEFAULT_DISCLAIMER,
  };
}

export function validateBodyShapeResult(
  raw: unknown,
  gender?: GenderType,
): BodyShapeAnalysisResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const allowedCategories =
    gender === 'male'
      ? MALE_BODY_SHAPES
      : gender === 'female'
        ? FEMALE_BODY_SHAPES
        : VALID_CATEGORIES;

  if (
    typeof obj.category !== 'string' ||
    !allowedCategories.includes(obj.category as BodyShapeCategory) ||
    typeof obj.confidence_level !== 'string' ||
    !VALID_CONFIDENCE.includes(obj.confidence_level as ConfidenceLevel) ||
    !isStringArray(obj.styling_guidance)
  ) {
    return null;
  }

  if (
    obj.alternative_candidates !== undefined &&
    !isStringArray(obj.alternative_candidates)
  ) {
    return null;
  }

  let photoQuality: PhotoQualityAssessment | undefined;
  if (obj.photo_quality !== undefined) {
    const parsedQuality = parsePhotoQuality(obj.photo_quality);
    if (!parsedQuality) {
      return null;
    }
    photoQuality = parsedQuality;
  }

  const category = obj.category as BodyShapeCategory;
  const confidenceLevel = obj.confidence_level as ConfidenceLevel;
  const needsReview =
    obj.status === 'needs_review' ||
    category === 'unknown' ||
    confidenceLevel === 'low' ||
    isNonConclusivePhotoQuality(photoQuality);

  return {
    analysis_type: 'body_shape',
    status: needsReview ? 'needs_review' : 'completed',
    category,
    alternative_candidates: obj.alternative_candidates ?? [],
    confidence_level: confidenceLevel,
    photo_quality: photoQuality ?? {
      lighting: needsReview ? 'uncertain' : 'acceptable',
      image_clarity: needsReview ? 'uncertain' : 'acceptable',
    },
    styling_guidance: obj.styling_guidance,
    limitations_note:
      typeof obj.limitations_note === 'string' && obj.limitations_note.trim()
        ? obj.limitations_note
        : 'Saran proporsi dan siluet bersifat umum berbasis estimasi foto 2D, bukan pengukuran tubuh profesional.',
    disclaimer:
      typeof obj.disclaimer === 'string' && obj.disclaimer.trim()
        ? obj.disclaimer
        : DEFAULT_DISCLAIMER,
  };
}

export function validateAnalysisResultPayload(
  raw: unknown,
): AnalysisResultPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const personalColor = validatePersonalColorResult(candidate.personal_color);
  const bodyShape = validateBodyShapeResult(candidate.body_shape);

  if (!personalColor || !bodyShape) {
    return null;
  }

  return {
    personal_color: personalColor,
    body_shape: bodyShape,
  };
}
