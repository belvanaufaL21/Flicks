import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  RATE_LIMIT_POLICIES,
  resetRateLimitsForTesting,
  resolveClientIp,
} from '../../src/server/security/rate-limiter';

const {
  createSupabaseTokenService,
  createSupabaseAnalysisService,
  createSupabaseVirtualTryOnService,
  validateAndStorePhoto,
  createSupabaseMidtransService,
} = vi.hoisted(() => ({
  createSupabaseTokenService: vi.fn(),
  createSupabaseAnalysisService: vi.fn(),
  createSupabaseVirtualTryOnService: vi.fn(),
  validateAndStorePhoto: vi.fn(),
  createSupabaseMidtransService: vi.fn(),
}));

vi.mock('../../src/server/tokens/token.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/server/tokens/token.service')>();
  return {
    ...actual,
    createSupabaseTokenService,
  };
});

vi.mock('../../src/server/analysis/analysis.service', () => ({
  createSupabaseAnalysisService,
}));

vi.mock('../../src/server/vto/virtual-try-on.service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/server/vto/virtual-try-on.service')
    >();
  return {
    ...actual,
    createSupabaseVirtualTryOnService,
  };
});

vi.mock('../../src/server/upload/upload.service', () => ({
  validateAndStorePhoto,
}));

vi.mock('../../src/server/payments/midtrans.service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/server/payments/midtrans.service')
    >();
  return {
    ...actual,
    createSupabaseMidtransService,
  };
});

import { POST as postAnalysis } from '../../src/app/api/analysis/route';
import { POST as postCheckout } from '../../src/app/api/checkout/route';
import { POST as postUpload } from '../../src/app/api/upload/route';
import { POST as postVto } from '../../src/app/api/virtual-try-on/route';

describe('Per-IP sliding-window rate limiter & endpoint guardrails (Task 1.1)', () => {
  beforeEach(() => {
    resetRateLimitsForTesting();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('resolves client IP from x-forwarded-for, x-real-ip, and local fallback', () => {
    const reqForwarded = new Request('http://localhost/api/analysis', {
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
    });
    expect(resolveClientIp(reqForwarded)).toBe('203.0.113.50');

    const reqRealIp = new Request('http://localhost/api/analysis', {
      headers: { 'x-real-ip': '198.51.100.12' },
    });
    expect(resolveClientIp(reqRealIp)).toBe('198.51.100.12');

    const reqFallback = new Request('http://localhost/api/analysis');
    expect(resolveClientIp(reqFallback)).toBe('127.0.0.1');
  });

  it('enforces sliding-window allowances per IP and per endpoint and recovers after window expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));

    expect(RATE_LIMIT_POLICIES).toEqual({
      analysis: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
      virtual_try_on: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
      upload: { maxRequests: 10, windowMs: 10 * 60 * 1000 },
      checkout: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
    });

    const makeReq = (ip = '10.0.0.1') =>
      new Request('http://localhost/api/analysis', {
        headers: { 'x-forwarded-for': ip },
      });

    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(makeReq(), 'analysis');
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4 - i);
    }

    const blocked = checkRateLimit(makeReq(), 'analysis');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(5);
    expect(blocked.retryAfterSeconds).toBe(600);

    // Different endpoint or different IP has independent budget
    expect(checkRateLimit(makeReq(), 'upload').allowed).toBe(true);
    expect(checkRateLimit(makeReq('10.0.0.2'), 'analysis').allowed).toBe(true);

    // Advance past 10-minute window -> allowed again
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const recovered = checkRateLimit(makeReq(), 'analysis');
    expect(recovered.allowed).toBe(true);
    expect(recovered.remaining).toBe(4);
  });

  it('returns 429 with rate-limit headers on /api/analysis, /api/virtual-try-on, /api/upload, and /api/checkout before downstream work', async () => {
    const reserveToken = vi.fn();
    const verifyToken = vi.fn();
    const createCheckout = vi.fn();
    createSupabaseTokenService.mockReturnValue({ reserveToken, verifyToken });
    createSupabaseMidtransService.mockReturnValue({ createCheckout });

    // Exhaust analysis (5), virtual_try_on (5), checkout (5), upload (10) on test IPs
    for (let i = 0; i < 5; i++) {
      checkRateLimit(
        new Request('http://localhost/api/analysis', {
          headers: { 'x-forwarded-for': '198.51.100.20' },
        }),
        'analysis',
      );
      checkRateLimit(
        new Request('http://localhost/api/virtual-try-on', {
          headers: { 'x-forwarded-for': '198.51.100.21' },
        }),
        'virtual_try_on',
      );
      checkRateLimit(
        new Request('http://localhost/api/checkout', {
          headers: { 'x-forwarded-for': '198.51.100.22' },
        }),
        'checkout',
      );
    }
    for (let i = 0; i < 10; i++) {
      checkRateLimit(
        new Request('http://localhost/api/upload', {
          headers: { 'x-forwarded-for': '198.51.100.23' },
        }),
        'upload',
      );
    }

    const analysisRes = await postAnalysis(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '198.51.100.20',
          authorization: 'Bearer tok-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          photo_path: 'face/id',
          gender: 'female',
          consent: true,
        }),
      }),
    );

    const vtoRes = await postVto(
      new Request('http://localhost/api/virtual-try-on', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '198.51.100.21',
          authorization: 'Bearer tok-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          analysis_id: 'a-1',
          product_id: 'p-1',
          photo_path: 'body/id',
        }),
      }),
    );

    const checkoutRes = await postCheckout(
      new Request('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.22' },
      }),
    );

    const formData = new FormData();
    formData.set(
      'photo',
      new File([Buffer.from('abc')], 'face.jpg', { type: 'image/jpeg' }),
    );
    formData.set('kind', 'face');
    formData.set('consent', 'true');
    const uploadRes = await postUpload(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '198.51.100.23',
          authorization: 'Bearer tok-secret',
        },
        body: formData,
      }),
    );

    for (const [res, expectedLimit] of [
      [analysisRes, '5'],
      [vtoRes, '5'],
      [checkoutRes, '5'],
      [uploadRes, '10'],
    ] as const) {
      expect(res.status).toBe(429);
      expect(res.headers.get('X-RateLimit-Limit')).toBe(expectedLimit);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(Number(res.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
      await expect(res.json()).resolves.toMatchObject({
        error: 'RATE_LIMIT_EXCEEDED',
        code: 'rate_limit_exceeded',
      });
    }

    expect(reserveToken).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
    expect(validateAndStorePhoto).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });
});
