import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAnalysisService } from '../../src/server/analysis/analysis.service';
import {
  createInMemoryTokenRepository,
  resetLocalDevMemoryState,
} from '../../src/server/dev/local-memory-store';
import {
  getRecentOperationalEvents,
  resetOperationalMonitorForTesting,
  trackPaidExecutionAndDetectSpike,
} from '../../src/server/monitoring/monitor';
import {
  createMidtransService,
  type PaymentRecord,
} from '../../src/server/payments/midtrans.service';
import { createTokenService } from '../../src/server/tokens/token.service';
import { executeVtoPipeline } from '../../src/server/vto/virtual-try-on.service';

describe('Task 1.3: Operational Error and Event Monitoring', () => {
  beforeEach(() => {
    resetLocalDevMemoryState();
    resetOperationalMonitorForTesting();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('captures payment_failure events on invalid webhook signature or failed Midtrans status', async () => {
    const payments = new Map<string, PaymentRecord>();
    const tokenRepo = createInMemoryTokenRepository();
    const tokenService = createTokenService(tokenRepo);
    const midtrans = createMidtransService(
      {
        async create(record) {
          payments.set(record.id, record);
          return record;
        },
        async findById(id) {
          return payments.get(id) ?? null;
        },
        async findByProviderReference(ref) {
          return (
            [...payments.values()].find((p) => p.providerReference === ref) ??
            null
          );
        },
        async updateStatus(id, patch) {
          const existing = payments.get(id)!;
          const updated = { ...existing, ...patch };
          payments.set(id, updated);
          return updated;
        },
      },
      tokenService,
      {
        serverKey: 'test-midtrans-secret',
      },
    );

    const badSig = await midtrans.handleNotification({
      order_id: 'flicks-missing',
      status_code: '200',
      gross_amount: '19000.00',
      signature_key: 'forged-signature',
      transaction_status: 'settlement',
    });
    expect(badSig).toEqual({ ok: false, code: 'INVALID_SIGNATURE' });

    const events = getRecentOperationalEvents();
    const paymentEvent = events.find(
      (event) =>
        event.category === 'payment_failure' &&
        event.code === 'INVALID_SIGNATURE',
    );
    expect(paymentEvent).toBeDefined();
    expect(JSON.stringify(paymentEvent)).not.toContain('test-midtrans-secret');
  });

  it('captures token_misuse events on unknown secret or consumed token replay without leaking raw secret', async () => {
    const tokenRepo = createInMemoryTokenRepository();
    const tokenService = createTokenService(tokenRepo);

    const invalidCheck = await tokenService.verifyToken('bogus-raw-secret-123');
    expect(invalidCheck.ok).toBe(false);

    const [issued] = await tokenService.createDevTokens(1);
    const reserved = await tokenService.reserveToken(issued!.secret);
    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      await tokenService.consumeToken(reserved.token.id);
    }

    const replay = await tokenService.reserveToken(issued!.secret);
    expect(replay.ok).toBe(false);

    const misuseEvents = getRecentOperationalEvents().filter(
      (event) => event.category === 'token_misuse',
    );
    expect(misuseEvents.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(misuseEvents)).not.toContain('bogus-raw-secret-123');
    expect(JSON.stringify(misuseEvents)).not.toContain(issued!.secret);
  });

  it('captures provider_job_failure events when Gemini analysis or FASHN VTO fails', async () => {
    const analysisService = createSupabaseAnalysisService({
      provider: {
        async analyzePhoto() {
          throw new Error('GEMINI_UPSTREAM_503');
        },
      },
    });

    const created = await analysisService.createJob({
      tokenId: 'tok-monitor-1',
      photoPath: 'private/face/test.jpg',
      consent: true,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const processed = await analysisService.processJob(created.job.id);
      expect(processed.status).toBe('failed');
    }

    const vtoResult = await executeVtoPipeline(
      {
        userPhotoUri: 'private/full_body/test.jpg',
        topProduct: { id: 'top-1', imagePath: 'products/top-1.jpg' },
      },
      {
        async submitTryOn() {
          return {
            kind: 'failed' as const,
            errorMessage: 'FASHN_TIMEOUT',
          };
        },
      },
    );
    expect(vtoResult.status).toBe('failed');

    const providerFailures = getRecentOperationalEvents().filter(
      (event) => event.category === 'provider_job_failure',
    );
    expect(providerFailures.some((e) => e.metadata?.provider === 'gemini')).toBe(
      true,
    );
    expect(providerFailures.some((e) => e.metadata?.provider === 'fashn')).toBe(
      true,
    );
  });

  it('detects unexpected usage_spike when paid executions exceed rolling threshold and forwards critical webhook if configured', async () => {
    vi.stubEnv('FLICKS_USAGE_SPIKE_THRESHOLD_10M', '3');
    vi.stubEnv('MONITORING_WEBHOOK_URL', 'https://alerts.example.test/hook');
    const webhookFetch = vi.fn().mockResolvedValue(new Response('ok'));

    trackPaidExecutionAndDetectSpike('analysis', 120, webhookFetch);
    trackPaidExecutionAndDetectSpike('analysis', 120, webhookFetch);
    trackPaidExecutionAndDetectSpike('virtual_try_on', 1200, webhookFetch);
    const spiked = trackPaidExecutionAndDetectSpike(
      'virtual_try_on',
      1200,
      webhookFetch,
    );

    expect(spiked).toBe(true);
    const spikeEvent = getRecentOperationalEvents().find(
      (event) => event.category === 'usage_spike',
    );
    expect(spikeEvent).toBeDefined();
    expect(spikeEvent?.severity).toBe('critical');
    expect(webhookFetch).toHaveBeenCalledTimes(1);
  });
});
