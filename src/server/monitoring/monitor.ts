export type OperationalEventCategory =
  | 'payment_failure'
  | 'token_misuse'
  | 'provider_job_failure'
  | 'usage_spike'
  | 'operator_action';

export type OperationalSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface OperationalEvent {
  id: string;
  category: OperationalEventCategory;
  severity: OperationalSeverity;
  code: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

// ponytail: structured JSON logs (indexed by Vercel Runtime Logs) + bounded in-memory ring buffer + optional webhook URL; add @sentry/nextjs or Axiom drain when traffic outgrows soft-launch.
const MAX_RECENT_EVENTS = 100;
const SPIKE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_SPIKE_THRESHOLD_10M = 20;

const recentEvents: OperationalEvent[] = [];
const paidExecutionWindow: Array<{ ts: number; costIdr: number }> = [];

export function recordOperationalEvent(
  input: Omit<OperationalEvent, 'id' | 'timestamp'>,
  options: { fetchImpl?: typeof fetch; forceConsole?: boolean } = {},
): OperationalEvent {
  const event: OperationalEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  };

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.length = MAX_RECENT_EVENTS;
  }

  if (!process.env.VITEST || options.forceConsole) {
    const payload = JSON.stringify({ scope: 'flicks.monitor', ...event });
    if (event.severity === 'info') {
      console.info(payload);
    } else if (event.severity === 'warn') {
      console.warn(payload);
    } else {
      console.error(payload);
    }
  }

  const webhookUrl = process.env.MONITORING_WEBHOOK_URL?.trim();
  if (
    webhookUrl &&
    (event.severity === 'error' || event.severity === 'critical')
  ) {
    const fetchFn = options.fetchImpl ?? fetch;
    void Promise.resolve(
      fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }),
    ).catch(() => {
      // Never allow alert forwarding failure to crash user request paths.
    });
  }

  return event;
}

export function trackPaidExecutionAndDetectSpike(
  feature: 'analysis' | 'virtual_try_on',
  estimatedCostIdr: number,
  fetchImpl?: typeof fetch,
): boolean {
  const now = Date.now();
  const cutoff = now - SPIKE_WINDOW_MS;
  while (paidExecutionWindow.length > 0 && paidExecutionWindow[0]!.ts <= cutoff) {
    paidExecutionWindow.shift();
  }

  paidExecutionWindow.push({ ts: now, costIdr: estimatedCostIdr });

  const configuredThreshold = Number(
    process.env.FLICKS_USAGE_SPIKE_THRESHOLD_10M,
  );
  const threshold =
    Number.isFinite(configuredThreshold) && configuredThreshold > 0
      ? configuredThreshold
      : DEFAULT_SPIKE_THRESHOLD_10M;

  if (paidExecutionWindow.length > threshold) {
    const rollingCostIdr = paidExecutionWindow.reduce(
      (sum, item) => sum + item.costIdr,
      0,
    );
    recordOperationalEvent(
      {
        category: 'usage_spike',
        severity: 'critical',
        code: 'PAID_EXECUTION_SPIKE',
        message: `Paid AI executions (${paidExecutionWindow.length}) exceeded 10m threshold (${threshold})`,
        metadata: {
          feature,
          count10m: paidExecutionWindow.length,
          threshold10m: threshold,
          rollingCostIdr: Math.round(rollingCostIdr * 100) / 100,
        },
      },
      { fetchImpl },
    );
    return true;
  }

  return false;
}

export function getRecentOperationalEvents(): readonly OperationalEvent[] {
  return [...recentEvents];
}

export function resetOperationalMonitorForTesting(): void {
  recentEvents.length = 0;
  paidExecutionWindow.length = 0;
}
