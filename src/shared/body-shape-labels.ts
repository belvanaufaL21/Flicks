export type GenderType = 'male' | 'female';

export type BodyShapeCategory =
  | 'trapezoid'
  | 'inverted_triangle'
  | 'rectangle'
  | 'triangle'
  | 'oval'
  | 'hourglass'
  | 'apple'
  | 'pear'
  | 'unknown';

export const MALE_BODY_SHAPES: readonly BodyShapeCategory[] = [
  'trapezoid',
  'inverted_triangle',
  'rectangle',
  'triangle',
  'oval',
  'unknown',
];

export const FEMALE_BODY_SHAPES: readonly BodyShapeCategory[] = [
  'rectangle',
  'hourglass',
  'inverted_triangle',
  'apple',
  'pear',
  'unknown',
];

export const VALID_CATEGORIES: readonly BodyShapeCategory[] = [
  'trapezoid',
  'inverted_triangle',
  'rectangle',
  'triangle',
  'oval',
  'hourglass',
  'apple',
  'pear',
  'unknown',
];

// ponytail: static lookup dictionary; move to i18n locale files only if multi-language UI is added.
export const BODY_SHAPE_LABELS: Record<
  BodyShapeCategory,
  { en: string; id: string; display: string }
> = {
  trapezoid: {
    en: 'Trapezoid',
    id: 'Trapesium',
    display: 'Trapezoid (Trapesium)',
  },
  inverted_triangle: {
    en: 'Inverted Triangle',
    id: 'Segitiga Terbalik',
    display: 'Inverted Triangle (Segitiga Terbalik)',
  },
  rectangle: {
    en: 'Rectangle',
    id: 'Persegi Panjang',
    display: 'Rectangle (Persegi Panjang)',
  },
  triangle: {
    en: 'Triangle',
    id: 'Segitiga',
    display: 'Triangle (Segitiga)',
  },
  oval: {
    en: 'Oval',
    id: 'Bulat/Bundar',
    display: 'Oval (Bulat/Bundar)',
  },
  hourglass: {
    en: 'Hourglass',
    id: 'Jam Pasir',
    display: 'Hourglass (Jam Pasir)',
  },
  apple: {
    en: 'Apple',
    id: 'Apel',
    display: 'Apple (Apel)',
  },
  pear: {
    en: 'Pear',
    id: 'Pir',
    display: 'Pear (Pir)',
  },
  unknown: {
    en: 'Unknown',
    id: 'Belum Teridentifikasi',
    display: 'Belum Teridentifikasi',
  },
};
