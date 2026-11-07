import { describe, expect, it, vi } from 'vitest';
import {
  callGeminiStructured,
  parseGeminiModels,
} from '../../src/server/providers/gemini';

describe('Gemini Model Multi-Fallback', () => {
  it('parses comma-separated models and defaults gracefully', () => {
    expect(parseGeminiModels('gemini-3.5-flash-lite, gemini-3.5-flash')).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
    ]);
    expect(parseGeminiModels('models/gemini-3.5-flash-lite')).toEqual([
      'gemini-3.5-flash-lite',
    ]);
    expect(parseGeminiModels('')).toEqual(['gemini-3.5-flash-lite']);
  });

  it('cascades to next model if the first model returns 503 high demand', async () => {
    const fetchMock = vi
      .fn()
      // First model (gemini-3.5-flash-lite) fails with 503
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: 'This model is currently experiencing high demand.',
            },
          }),
          { status: 503 },
        ),
      )
      // Fallback model (gemini-3.5-flash) succeeds
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ ok: true }) }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          }),
          { status: 200 },
        ),
      );

    const result = await callGeminiStructured<{ ok: boolean }>({
      apiKey: 'test-key',
      model: 'gemini-3.5-flash-lite, gemini-3.5-flash',
      prompt: 'test prompt',
      image: { photoPath: 'photo.jpg' },
      validate: (raw: unknown): { ok: boolean } | null => {
        if (typeof raw === 'object' && raw !== null && (raw as { ok?: boolean }).ok) {
          return raw as { ok: boolean };
        }
        return null;
      },
      fetchImpl: fetchMock,
    });

    expect(result.data.ok).toBe(true);
    expect(result.usage.model).toBe('gemini-3.5-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
