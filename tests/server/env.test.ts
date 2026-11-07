import { describe, expect, it } from 'vitest';
import { getRequiredEnv } from '../../src/server/env';

describe('getRequiredEnv', () => {
  it('returns a configured value without logging or transforming it', () => {
    expect(getRequiredEnv('GEMINI_API_KEY', { GEMINI_API_KEY: 'secret' })).toBe(
      'secret',
    );
  });

  it('reports a missing variable by name without exposing its value', () => {
    expect(() =>
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', {
        SUPABASE_SERVICE_ROLE_KEY: ' ',
      }),
    ).toThrow('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  });
});
