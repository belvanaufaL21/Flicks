import { describe, expect, it } from 'vitest';
import {
  BODY_SHAPE_LABELS,
  FEMALE_BODY_SHAPES,
  MALE_BODY_SHAPES,
  validateBodyShapeResult,
  type BodyShapeCategory,
  type GenderType,
} from '../../src/server/analysis/schemas';

describe('Gender-Differentiated Body Shape Schemas & Validation', () => {
  it('defines correct categories for male and female body shapes', () => {
    const maleGender: GenderType = 'male';
    const femaleGender: GenderType = 'female';
    expect(maleGender).toBe('male');
    expect(femaleGender).toBe('female');

    expect(MALE_BODY_SHAPES).toEqual([
      'trapezoid',
      'inverted_triangle',
      'rectangle',
      'triangle',
      'oval',
      'unknown',
    ]);

    expect(FEMALE_BODY_SHAPES).toEqual([
      'rectangle',
      'hourglass',
      'inverted_triangle',
      'apple',
      'pear',
      'unknown',
    ]);
  });

  it('provides bilingual labels for all body shape categories', () => {
    const allCategories: BodyShapeCategory[] = [
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

    allCategories.forEach((cat) => {
      const label = BODY_SHAPE_LABELS[cat];
      expect(label).toBeDefined();
      expect(label.en).toBeTruthy();
      expect(label.id).toBeTruthy();
      expect(label.display).toBeTruthy();
    });

    expect(BODY_SHAPE_LABELS.trapezoid.display).toBe('Trapezoid (Trapesium)');
    expect(BODY_SHAPE_LABELS.hourglass.display).toBe('Hourglass (Jam Pasir)');
    expect(BODY_SHAPE_LABELS.apple.display).toBe('Apple (Apel)');
    expect(BODY_SHAPE_LABELS.oval.display).toBe('Oval (Bulat/Bundar)');
    expect(BODY_SHAPE_LABELS.inverted_triangle.display).toBe(
      'Inverted Triangle (Segitiga Terbalik)',
    );
  });

  it('validates valid male body shape results', () => {
    const rawMaleResult = {
      category: 'trapezoid',
      confidence_level: 'high',
      styling_guidance: ['Gunakan kemeja slim-fit'],
    };

    const validated = validateBodyShapeResult(rawMaleResult, 'male');
    expect(validated).not.toBeNull();
    expect(validated?.category).toBe('trapezoid');
    expect(validated?.status).toBe('completed');
  });

  it('rejects female-only categories when gender is male', () => {
    const invalidMaleResult = {
      category: 'hourglass',
      confidence_level: 'high',
      styling_guidance: ['Gunakan ikat pinggang'],
    };

    const validated = validateBodyShapeResult(invalidMaleResult, 'male');
    expect(validated).toBeNull();
  });

  it('validates valid female body shape results', () => {
    const rawFemaleResult = {
      category: 'hourglass',
      confidence_level: 'high',
      styling_guidance: ['Gunakan wrap dress'],
    };

    const validated = validateBodyShapeResult(rawFemaleResult, 'female');
    expect(validated).not.toBeNull();
    expect(validated?.category).toBe('hourglass');
    expect(validated?.status).toBe('completed');
  });

  it('rejects male-only categories when gender is female', () => {
    const invalidFemaleResult = {
      category: 'trapezoid',
      confidence_level: 'high',
      styling_guidance: ['Gunakan jaket bomber'],
    };

    const validated = validateBodyShapeResult(invalidFemaleResult, 'female');
    expect(validated).toBeNull();
  });

  it('falls back to needs_review when category is unknown', () => {
    const unknownResult = {
      category: 'unknown',
      confidence_level: 'medium',
      styling_guidance: ['Siluet tidak jelas'],
    };

    const validatedMale = validateBodyShapeResult(unknownResult, 'male');
    expect(validatedMale?.category).toBe('unknown');
    expect(validatedMale?.status).toBe('needs_review');

    const validatedFemale = validateBodyShapeResult(unknownResult, 'female');
    expect(validatedFemale?.category).toBe('unknown');
    expect(validatedFemale?.status).toBe('needs_review');
  });
});
