import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import { GET as getAdminSummary } from '../../src/app/api/admin/summary/route';
import { POST as postAnalysis } from '../../src/app/api/analysis/route';
import { GET as getCronCleanup } from '../../src/app/api/cron/cleanup-photos/route';
import { POST as postUpload } from '../../src/app/api/upload/route';
import { resetLocalDevMemoryState } from '../../src/server/dev/local-memory-store';
import { resetRateLimitsForTesting } from '../../src/server/security/rate-limiter';

describe('Task 1.2: Security Headers, Private Storage, and Server Authorization', () => {
  beforeEach(() => {
    resetLocalDevMemoryState();
    resetRateLimitsForTesting();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('configures CSP and baseline security headers on all routes in next.config.ts', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    const rules = await nextConfig.headers!();
    const globalRule = rules.find((rule) => rule.source === '/(.*)');
    expect(globalRule).toBeDefined();

    const headerMap = new Map(
      globalRule!.headers.map((header) => [header.key, header.value]),
    );

    const csp = headerMap.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain('data:');
    expect(csp).toContain('blob:');

    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(headerMap.get('Permissions-Policy')).toContain('microphone=()');
    expect(headerMap.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('enforces private photo bucket, 72h max expiry constraint, and forced RLS in schema migrations', () => {
    const photoMigration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261023120000_photo_private_storage.sql',
      ),
      'utf8',
    );

    expect(photoMigration).toContain("'flicks-private-photos'");
    expect(photoMigration).toContain('public = false');
    expect(photoMigration).toContain(
      "check (expires_at <= created_at + interval '72 hours')",
    );
    expect(photoMigration).toContain(
      'alter table public.photo_assets force row level security;',
    );
    expect(photoMigration).toContain(
      'revoke all on table public.photo_assets from public, anon, authenticated;',
    );
  });

  it('enforces server-side authorization on admin, cron, and paid token endpoints', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-cron');

    const adminRes = await getAdminSummary(
      new Request('http://localhost/api/admin/summary'),
    );
    expect(adminRes.status).toBe(401);

    const cronRes = await getCronCleanup(
      new Request('http://localhost/api/cron/cleanup-photos', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(cronRes.status).toBe(401);

    const uploadRes = await postUpload(
      new Request('http://localhost/api/upload', {
        method: 'POST',
      }),
    );
    expect(uploadRes.status).toBe(401);

    const analysisRes = await postAnalysis(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(analysisRes.status).toBe(401);
  });
});
