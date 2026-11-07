import { NextResponse } from 'next/server';
import { recordOperationalEvent } from '@/server/monitoring/monitor';

export type RateLimitEndpoint =
  | 'analysis'
  | 'virtual_try_on'
  | 'upload'
  | 'checkout';

export interface RateLimitPolicy {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitEndpoint, RateLimitPolicy> = {
  analysis: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
  virtual_try_on: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
  upload: { maxRequests: 10, windowMs: 10 * 60 * 1000 },
  checkout: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
};

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetEpochSeconds: number;
}

// ponytail: in-memory sliding-window buckets per warm serverless instance (adequate for 10-100 pilot testers); upgrade to Upstash Redis (@upstash/ratelimit) when scaling multi-region.
const MAX_TRACKED_KEYS = 5_000;
const memoryBuckets = new Map<string, number[]>();

export function resolveClientIp(request?: Request): string {
  if (!request) {
    return '127.0.0.1';
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

function pruneStaleBuckets(now: number, maxWindowMs: number): void {
  if (memoryBuckets.size <= MAX_TRACKED_KEYS) return;
  const cutoff = now - maxWindowMs;
  for (const [key, timestamps] of memoryBuckets.entries()) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1]! <= cutoff) {
      memoryBuckets.delete(key);
    }
  }
}

export function checkRateLimit(
  request: Request | undefined,
  endpoint: RateLimitEndpoint,
): RateLimitResult {
  const policy = RATE_LIMIT_POLICIES[endpoint];
  const ip = resolveClientIp(request);
  const key = `${endpoint}:${ip}`;
  const now = Date.now();
  const windowStart = now - policy.windowMs;

  const existing = memoryBuckets.get(key) ?? [];
  const validTimestamps = existing.filter((ts) => ts > windowStart);

  if (validTimestamps.length >= policy.maxRequests) {
    const oldestValid = validTimestamps[0] ?? now;
    const resetMs = oldestValid + policy.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - now) / 1000));
    memoryBuckets.set(key, validTimestamps);

    return {
      allowed: false,
      limit: policy.maxRequests,
      remaining: 0,
      retryAfterSeconds,
      resetEpochSeconds: Math.ceil(resetMs / 1000),
    };
  }

  validTimestamps.push(now);
  memoryBuckets.set(key, validTimestamps);
  pruneStaleBuckets(now, 10 * 60 * 1000);

  return {
    allowed: true,
    limit: policy.maxRequests,
    remaining: Math.max(0, policy.maxRequests - validTimestamps.length),
    retryAfterSeconds: 0,
    resetEpochSeconds: Math.ceil((now + policy.windowMs) / 1000),
  };
}

export function enforceRateLimit(
  request: Request | undefined,
  endpoint: RateLimitEndpoint,
): NextResponse | null {
  const check = checkRateLimit(request, endpoint);
  if (check.allowed) {
    return null;
  }

  recordOperationalEvent({
    category: 'token_misuse',
    severity: 'warn',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Per-IP rate limit exceeded on ${endpoint}`,
    metadata: {
      endpoint,
      ip: resolveClientIp(request),
      retryAfterSeconds: check.retryAfterSeconds,
    },
  });

  return NextResponse.json(
    {
      error: 'RATE_LIMIT_EXCEEDED',
      code: 'rate_limit_exceeded',
      message:
        'Terlalu banyak permintaan dari perangkat Anda. Silakan coba beberapa saat lagi.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(check.retryAfterSeconds),
        'X-RateLimit-Limit': String(check.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(check.resetEpochSeconds),
      },
    },
  );
}

export function resetRateLimitsForTesting(): void {
  memoryBuckets.clear();
}
