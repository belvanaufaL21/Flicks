import { describe, expect, it, vi } from 'vitest';
import { buildBodyShapePrompt } from '../../src/server/analysis/body-shape';
import {
  createAnalysisService,
  createInMemoryAnalysisJobRepository,
} from '../../src/server/analysis/analysis.service';

describe('buildBodyShapePrompt by gender & service pipeline', () => {
  it('builds male-specific prompt with menswear silhouette instructions', () => {
    const prompt = buildBodyShapePrompt('photos/male-body.jpg', 'male');

    expect(prompt).toContain('Menswear');
    expect(prompt).toContain('trapezoid');
    expect(prompt).toContain('inverted_triangle');
    expect(prompt).toContain('rectangle');
    expect(prompt).toContain('triangle');
    expect(prompt).toContain('oval');
    expect(prompt).not.toContain('"hourglass"');
    expect(prompt).not.toContain('"pear"');
    expect(prompt).not.toContain('"apple"');
    expect(prompt).toContain('photos/male-body.jpg');
  });

  it('builds female-specific prompt with womenswear silhouette instructions', () => {
    const prompt = buildBodyShapePrompt('photos/female-body.jpg', 'female');

    expect(prompt).toContain('Womenswear');
    expect(prompt).toContain('hourglass');
    expect(prompt).toContain('pear');
    expect(prompt).toContain('apple');
    expect(prompt).toContain('rectangle');
    expect(prompt).toContain('inverted_triangle');
    expect(prompt).not.toContain('"trapezoid"');
    expect(prompt).not.toContain('"oval"');
    expect(prompt).toContain('photos/female-body.jpg');
  });

  it('defaults to female when gender is omitted for backward compatibility', () => {
    const prompt = buildBodyShapePrompt('photos/default.jpg');
    expect(prompt).toContain('hourglass');
  });

  it('persists gender in job.input and forwards it to provider.analyzePhoto', async () => {
    const repo = createInMemoryAnalysisJobRepository();
    const analyzePhoto = vi.fn().mockResolvedValue({
      status: 'completed',
      result: {
        personal_color: {
          primary_season: 'winter',
          sub_season: 'deep winter',
          confidence_level: 'high',
          recommended_colors: ['#000000'],
        },
        body_shape: {
          category: 'trapezoid',
          confidence_level: 'high',
          styling_guidance: ['Gunakan blazer structured'],
        },
      },
    });

    const service = createAnalysisService(repo, {
      provider: { analyzePhoto },
    });

    const created = await service.createJob({
      tokenId: 'tok-gender-test-1',
      photoPath: 'photos/face.jpg',
      fullBodyPhotoPath: 'photos/body.jpg',
      gender: 'male',
      consent: true,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.job.input.gender).toBe('male');

    await service.processJob(created.job.id);
    expect(analyzePhoto).toHaveBeenCalledWith(
      'photos/face.jpg',
      'photos/body.jpg',
      'male',
    );
  });
});
