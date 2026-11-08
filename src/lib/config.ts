// Server-only configuration. Never import this from a client component:
// none of these values may reach the browser.

const env = process.env;
const isProduction = env.NODE_ENV === "production";

// FLICKS_MOCK=1 forces every provider into demo mode. Otherwise a provider runs
// in demo mode only when its key is missing, and never in production, where a
// missing key is a configuration error rather than a reason to fake results.
const forceMock = env.FLICKS_MOCK === "1";

function providerMode(key: string | undefined): "live" | "mock" {
  if (forceMock) return "mock";
  if (key) return "live";
  if (isProduction) {
    throw new Error("Provider API key is missing in production. Set it or set FLICKS_MOCK=1.");
  }
  return "mock";
}

// Pages and route handlers load separate copies of this module, so the fallback must
// live on globalThis or each copy would sign with a different secret.
function devFallbackSecret() {
  const g = globalThis as unknown as { __flicksDevSecret?: string };
  g.__flicksDevSecret ??= crypto.randomUUID() + crypto.randomUUID();
  return g.__flicksDevSecret;
}

export const config = {
  appUrl: env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  isProduction,

  // Kill-switch (PRD release gate 8): set to "false" to stop all paid features at once.
  paidFeaturesEnabled: env.PAID_FEATURES_ENABLED !== "false",

  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  },

  priceIdr: 19_000,
  reportTtlMs: 72 * 60 * 60 * 1000,

  gemini: {
    get mode() {
      return providerMode(env.GEMINI_API_KEY);
    },
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-2.5-flash",
    maxAttempts: 2,
  },

  fashn: {
    get mode() {
      return providerMode(env.FASHN_API_KEY);
    },
    apiKey: env.FASHN_API_KEY,
    model: env.FASHN_MODEL || "tryon-v1.6",
    baseUrl: "https://api.fashn.ai/v1",
    maxAttempts: 2,
  },

  midtrans: {
    get mode() {
      return providerMode(env.MIDTRANS_SERVER_KEY);
    },
    serverKey: env.MIDTRANS_SERVER_KEY ?? "",
    baseUrl:
      env.MIDTRANS_IS_PRODUCTION === "true"
        ? "https://api.midtrans.com"
        : "https://api.sandbox.midtrans.com",
  },

  // Signs short-lived URLs for private photos. A per-process fallback is fine in
  // development; production must set a fixed value so URLs survive restarts.
  mediaSigningSecret: env.MEDIA_SIGNING_SECRET ?? (isProduction ? undefined : devFallbackSecret()),

  // Planning estimates from PRD §I, logged per call until real invoices are in.
  estimatedCostIdr: {
    geminiPerModule: 99,
    fashnPerOutput: 1_350,
  },
};

export function requireMediaSecret(): string {
  if (!config.mediaSigningSecret) throw new Error("MEDIA_SIGNING_SECRET is not set.");
  return config.mediaSigningSecret;
}

export function isDemoMode() {
  return (
    config.gemini.mode === "mock" || config.fashn.mode === "mock" || config.midtrans.mode === "mock"
  );
}
