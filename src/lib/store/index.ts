import { config } from "@/lib/config";
import { memoryStore } from "./memory-store";
import { createSupabaseStore } from "./supabase-store";
import type { Store } from "./types";

// Supabase when it is configured, the in-memory store otherwise. Production refuses
// to run on memory: a restart would silently lose paid tokens. Callers that can work
// without data (the flow state, the health check) ask storeAvailable() first, so a
// missing setting shows "not available" instead of a server error.

const g = globalThis as unknown as { __flicksSupabaseStore?: Store };

export function storeAvailable() {
  const { url, secretKey } = config.supabase;
  return Boolean(url && secretKey) || !config.isProduction;
}

export function getStore(): Store {
  const { url, secretKey } = config.supabase;
  if (url && secretKey) return (g.__flicksSupabaseStore ??= createSupabaseStore(url, secretKey));
  if (config.isProduction) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  return memoryStore;
}

export type { Store } from "./types";
