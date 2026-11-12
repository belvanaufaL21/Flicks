// Server-only configuration. Never import this from a client component:
// none of these values may reach the browser.

const env = process.env;
const isProduction = env.NODE_ENV === "production";

// FLICKS_MOCK=1 forces every provider into demo mode. Otherwise a provider runs
// in demo mode only when its key is missing, and never in production, where a
// missing key is a configuration gap rather than a reason to fake results (a
// simulated payment there would hand out free tokens). In production a provider
// without a key is "missing": the site keeps working and only the feature that
// needs it is refused with a clear message.
const forceMock = env.FLICKS_MOCK === "1";

export type ProviderMode = "live" | "mock" | "missing";

function providerMode(key: string | undefined): ProviderMode {
  if (forceMock) return "mock";
  if (key) return "live";
  return isProduction ? "missing" : "mock";
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

  // Trial mode: step 1 issues a token without payment, so the flow can be tried
  // before Midtrans is ready. Off unless set to "true". Every free token still runs
  // the real analysis model (about Rp200 each), so switch it off before launch.
  freeCheckout: env.FREE_CHECKOUT === "true",

  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  },

  priceIdr: 19_000,
  reportTtlMs: 72 * 60 * 60 * 1000,

  // Analysis model via OpenRouter. Gemini 3.8 Flash: strong image understanding,
  // JSON-schema output, mid-range price. The fallback is another Google model so the
  // photos stay with the processors named in the privacy notice.
  openrouter: {
    get mode() {
      return providerMode(env.OPENROUTER_API_KEY?.trim());
    },
    apiKey: env.OPENROUTER_API_KEY?.trim(),
    baseUrl: "https://openrouter.ai/api/v1",
    model: env.OPENROUTER_MODEL?.trim() || "google/gemini-3.8-flash",
    fallbackModels: (env.OPENROUTER_FALLBACK_MODELS ?? "google/gemini-3.7-flash")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    maxAttempts: 2,
  },

  fashn: {
    get mode(): ProviderMode {
      const mode = providerMode(env.FASHN_API_KEY);
      // During the free trial nobody pays, so a demo try-on is acceptable even in
      // production; the page says so. With paid checkout a missing key stays "missing".
      return mode === "missing" && env.FREE_CHECKOUT === "true" ? "mock" : mode;
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
    snapUrl:
      env.MIDTRANS_IS_PRODUCTION === "true"
        ? "https://app.midtrans.com"
        : "https://app.sandbox.midtrans.com",
  },

  // Signs short-lived URLs for private photos. A per-process fallback is fine in
  // development; production must set a fixed value so URLs survive restarts.
  mediaSigningSecret: env.MEDIA_SIGNING_SECRET ?? (isProduction ? undefined : devFallbackSecret()),

  // Analysis cost comes from OpenRouter's reported charge per call. FASHN still uses
  // the PRD §I planning estimate until real invoices are in.
  usdToIdr: Number(env.USD_TO_IDR) || 18_000,
  estimatedCostIdr: {
    fashnPerOutput: 1_350,
  },
};

export function requireMediaSecret(): string {
  if (!config.mediaSigningSecret) throw new Error("MEDIA_SIGNING_SECRET is not set.");
  return config.mediaSigningSecret;
}

/**
 * Names (never values) of the settings production still needs before the package can
 * be sold. Empty in development, where missing providers fall back to demo mode.
 */
export function missingSettings(): string[] {
  if (!config.isProduction) return [];
  const required: Record<string, unknown> = {
    NEXT_PUBLIC_SUPABASE_URL: config.supabase.url,
    SUPABASE_SECRET_KEY: config.supabase.secretKey,
    MEDIA_SIGNING_SECRET: config.mediaSigningSecret,
    OPENROUTER_API_KEY: config.openrouter.mode !== "missing",
    FASHN_API_KEY: config.fashn.mode !== "missing",
    // Not needed while trial mode hands out tokens without payment.
    MIDTRANS_SERVER_KEY: config.freeCheckout || config.midtrans.mode !== "missing",
  };
  return Object.entries(required)
    .filter(([, v]) => !v)
    .map(([name]) => name);
}
/** Plain-language notes for the parts of the flow that are currently simulated. */
export function demoNotes(): string[] {
  const notes: string[] = [];
  if (config.midtrans.mode === "mock" && !config.freeCheckout) notes.push("pembayaran disimulasikan, tidak ada uang yang ditarik");
  if (config.openrouter.mode === "mock") notes.push("hasil analisis berupa contoh tetap, bukan dari fotomu");
  if (config.fashn.mode === "mock") notes.push("virtual try-on menampilkan foto aslimu tanpa pakaian baru");
  return notes;
}

export function isDemoMode() {
  return (
    config.openrouter.mode === "mock" || config.fashn.mode === "mock" || config.midtrans.mode === "mock"
  );
}
