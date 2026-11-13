import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseTokenService } = vi.hoisted(() => ({
  createSupabaseTokenService: vi.fn(),
}));

vi.mock('../../src/server/tokens/token.service', () => ({
  createSupabaseTokenService,
}));

import { GET } from '../../src/app/api/dev/tokens/route';

describe('GET /api/dev/tokens', () => {
  const createDevTokens = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    createDevTokens.mockReset();
    createSupabaseTokenService.mockReturnValue({ createDevTokens });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is gated in production with 404', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GET(
      new Request('http://localhost/api/dev/tokens?count=1'),
    );

    expect(response.status).toBe(404);
    expect(createDevTokens).not.toHaveBeenCalled();
  });

  it('rejects invalid count values with 400 INVALID_COUNT', async () => {
    for (const query of ['count=0', 'count=21', 'count=abc', 'count=-1']) {
      const response = await GET(
        new Request(`http://localhost/api/dev/tokens?${query}`),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'INVALID_COUNT',
      });
    }
    expect(createDevTokens).not.toHaveBeenCalled();
  });

  it('defaults count to 1 and returns issued dev tokens for frontend integration testing', async () => {
    createDevTokens.mockResolvedValueOnce([
      {
        id: 'uuid-1',
        secret: 'raw-token-value',
        status: 'available',
      },
    ]);

    const response = await GET(new Request('http://localhost/api/dev/tokens'));

    expect(response.status).toBe(200);
    expect(createDevTokens).toHaveBeenCalledWith(1);
    await expect(response.json()).resolves.toEqual({
      tokens: [
        {
          id: 'uuid-1',
          secret: 'raw-token-value',
          status: 'available',
        },
      ],
    });
  });
});
