import { describe, expect, it } from 'vitest';
import { GET } from '../../src/app/api/health/route';

describe('GET /api/health', () => {
  it('reports application liveness without claiming external dependencies are healthy', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      scope: 'application',
    });
  });
});
