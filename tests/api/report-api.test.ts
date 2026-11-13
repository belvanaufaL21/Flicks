import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createSupabaseReportService,
  createSupabasePhotoStorage,
  createSupabaseTokenService,
} = vi.hoisted(() => ({
  createSupabaseReportService: vi.fn(),
  createSupabasePhotoStorage: vi.fn(),
  createSupabaseTokenService: vi.fn(),
}));

vi.mock('../../src/server/reports/report.service', () => ({
  createSupabaseReportService,
  hashReportSecret: vi.fn((s: string) => `hash-${s}`),
}));

vi.mock('../../src/server/storage/private-photo-storage', () => ({
  createSupabasePhotoStorage,
}));

vi.mock('../../src/server/tokens/token.service', () => ({
  createSupabaseTokenService,
  extractBearerToken: vi.fn((authHeader: string | null) => {
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim() || null;
  }),
}));

import { POST } from '../../src/app/api/report/route';
import { GET as getReport } from '../../src/app/api/report/[secret]/route';
import { GET as getAsset } from '../../src/app/api/report/[secret]/asset/[kind]/route';

describe('Report API Routes (/api/report/*)', () => {
  const createOrGetReport = vi.fn();
  const getReportBySecret = vi.fn();
  const getAssetPathForReport = vi.fn();
  const readAsset = vi.fn();
  const verifyToken = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    createOrGetReport.mockReset();
    getReportBySecret.mockReset();
    getAssetPathForReport.mockReset();
    readAsset.mockReset();
    verifyToken.mockReset();

    createSupabaseReportService.mockReturnValue({
      createOrGetReport,
      getReportBySecret,
      getAssetPathForReport,
    });
    createSupabasePhotoStorage.mockReturnValue({
      read: readAsset,
    });
    createSupabaseTokenService.mockReturnValue({
      verifyToken,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/report issues a private report link for a valid bearer token', async () => {
    verifyToken.mockResolvedValueOnce({
      ok: true,
      token: { id: 'tok-1', status: 'used' },
    });
    createOrGetReport.mockResolvedValueOnce({
      reportId: 'rep-1',
      secret: 'a'.repeat(48),
      expiresAt: '2026-11-07T12:00:00.000Z',
    });

    const res = await POST(
      new Request('https://example.com/api/report', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token-secret' },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.secret).toBe('a'.repeat(48));
    expect(body.url).toBe(`/result/${'a'.repeat(48)}`);
    expect(createOrGetReport).toHaveBeenCalledWith('tok-1');
  });

  it('GET /api/report/[secret] returns 200 for valid report and 410 for expired report', async () => {
    getReportBySecret.mockResolvedValueOnce({
      status: 'active',
      payload: {
        reportId: 'rep-1',
        personalColor: { primarySeason: 'Warm Autumn' },
      },
    });

    const activeRes = await getReport(
      new Request('https://example.com/api/report/valid-secret'),
      { params: { secret: 'valid-secret' } },
    );
    expect(activeRes.status).toBe(200);

    getReportBySecret.mockResolvedValueOnce({
      status: 'expired',
      payload: null,
    });
    const expiredRes = await getReport(
      new Request('https://example.com/api/report/expired-secret'),
      { params: { secret: 'expired-secret' } },
    );
    expect(expiredRes.status).toBe(410);
    const body = await expiredRes.json();
    expect(body.error).toBe('REPORT_EXPIRED');
  });

  it('GET /api/report/[secret]/asset/[kind] streams asset for valid secret and denies invalid/expired', async () => {
    getAssetPathForReport.mockResolvedValueOnce({
      status: 'active',
      objectPath: 'vto/result-1.jpg',
    });
    readAsset.mockResolvedValueOnce({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: 'image/jpeg',
    });

    const res = await getAsset(
      new Request('https://example.com/api/report/valid-secret/asset/vto_result'),
      { params: { secret: 'valid-secret', kind: 'vto_result' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('no-store');

    getAssetPathForReport.mockResolvedValueOnce({
      status: 'expired',
      objectPath: null,
    });
    const expiredRes = await getAsset(
      new Request(
        'https://example.com/api/report/expired-secret/asset/vto_result',
      ),
      { params: { secret: 'expired-secret', kind: 'vto_result' } },
    );
    expect(expiredRes.status).toBe(410);
  });
});
