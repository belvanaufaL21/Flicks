import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  getLocalDevMemoryState,
  isSupabaseConfigured,
  type KillSwitchState,
} from '@/server/dev/local-memory-store';
import { recordOperationalEvent } from '@/server/monitoring/monitor';

export type { KillSwitchState };

// ponytail: 5s per-instance read cache over Supabase system_settings + env override; upgrade to Vercel Edge Config if zero-DB-read global propagation is needed.
const CACHE_TTL_MS = 5_000;
let cachedState: { state: KillSwitchState; expiresAt: number } | null = null;

function isEnvKillSwitchEnabled(): boolean {
  const raw = process.env.FLICKS_PAID_WORK_PAUSED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

function shouldUseMemoryStore(): boolean {
  return (
    canUseLocalDevFallback() ||
    Boolean(process.env.VITEST) ||
    !isSupabaseConfigured()
  );
}

function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ponytail: 5s module cache + Supabase system_settings row. Upgrade path: Edge Config or Redis pub/sub for <50ms global propagation.
export async function getKillSwitchState(): Promise<KillSwitchState> {
  if (isEnvKillSwitchEnabled()) {
    return {
      paidWorkPaused: true,
      reason: 'FLICKS_PAID_WORK_PAUSED environment override',
      updatedAt: new Date().toISOString(),
    };
  }

  if (shouldUseMemoryStore()) {
    return { ...getLocalDevMemoryState().systemSettings.killSwitch };
  }

  if (cachedState && cachedState.expiresAt > Date.now()) {
    return cachedState.state;
  }

  try {
    const client = createSupabaseServiceClient();
    const { data, error } = await client
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', 'kill_switch')
      .maybeSingle();

    if (error || !data) {
      return {
        paidWorkPaused: false,
        reason: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const rawValue = (data.value ?? {}) as Record<string, unknown>;
    const state: KillSwitchState = {
      paidWorkPaused: Boolean(rawValue.paid_work_paused),
      reason:
        typeof rawValue.reason === 'string' && rawValue.reason.trim()
          ? rawValue.reason.trim()
          : null,
      updatedAt: String(data.updated_at ?? new Date().toISOString()),
    };
    cachedState = { state, expiresAt: Date.now() + CACHE_TTL_MS };
    return state;
  } catch {
    return {
      paidWorkPaused: false,
      reason: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function setKillSwitchState(input: {
  paidWorkPaused: boolean;
  reason?: string | null;
}): Promise<KillSwitchState> {
  const updatedAt = new Date().toISOString();
  const normalizedReason =
    typeof input.reason === 'string' && input.reason.trim()
      ? input.reason.trim()
      : null;

  const nextState: KillSwitchState = {
    paidWorkPaused: Boolean(input.paidWorkPaused),
    reason: normalizedReason,
    updatedAt,
  };

  if (shouldUseMemoryStore()) {
    getLocalDevMemoryState().systemSettings.killSwitch = nextState;
  } else {
    const client = createSupabaseServiceClient();
    const { error } = await client.from('system_settings').upsert(
      {
        key: 'kill_switch',
        value: {
          paid_work_paused: nextState.paidWorkPaused,
          reason: nextState.reason,
        },
        updated_at: updatedAt,
      },
      { onConflict: 'key' },
    );
    if (error) {
      throw error;
    }
  }

  cachedState = { state: nextState, expiresAt: Date.now() + CACHE_TTL_MS };

  recordOperationalEvent({
    category: 'operator_action',
    severity: nextState.paidWorkPaused ? 'critical' : 'warn',
    code: nextState.paidWorkPaused ? 'KILL_SWITCH_ENGAGED' : 'KILL_SWITCH_RESUMED',
    message: nextState.paidWorkPaused
      ? 'Operator paused paid AI analysis and virtual try-on execution'
      : 'Operator resumed paid AI analysis and virtual try-on execution',
    metadata: { reason: nextState.reason },
  });

  return nextState;
}

export async function enforcePaidWorkActive(): Promise<NextResponse | null> {
  const state = await getKillSwitchState();
  if (!state.paidWorkPaused) {
    return null;
  }

  return NextResponse.json(
    {
      error: 'PAID_WORK_PAUSED',
      code: 'paid_work_paused',
      message:
        'Layanan analisis AI & Virtual Try-On sedang dijeda sementara oleh operator untuk pemeliharaan. Token Anda tetap aman dan belum terpakai.',
      reason: state.reason,
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Retry-After': '60',
      },
    },
  );
}
