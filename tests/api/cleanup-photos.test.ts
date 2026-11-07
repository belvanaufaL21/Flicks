import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabasePhotoCleanupService } = vi.hoisted(() => ({
  createSupabasePhotoCleanupService: vi.fn(),
}));

vi.mock('../../src/server/storage/cleanup-expired-photos', () => ({
  createSupabasePhotoCleanupService,
}));

import { GET } from '../../src/app/api/cron/cleanup-photos/route';

describe('GET /api/cron/cleanup-photos', () => {
  const run = vi.fn();

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'scheduled-cleanup-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    run.mockResolvedValue({ deletedCount: 2 });
    createSupabasePhotoCleanupService.mockReturnValue({ run });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects callers without the scheduled cleanup secret', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-photos'),
    );

    expect(response.status).toBe(401);
    expect(createSupabasePhotoCleanupService).not.toHaveBeenCalled();
  });

  it('cleans expired objects and returns only the count', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-photos', {
        headers: { authorization: 'Bearer scheduled-cleanup-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deletedCount: 2 });
    expect(run).toHaveBeenCalledOnce();
  });
});
