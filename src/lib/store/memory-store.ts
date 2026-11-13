import type { Analysis, Payment, Photo, Product, Token, TryonJob, UsageEvent } from "@/types/domain";
import { seedProducts } from "./seed-products";
import type { PhotoMeta, Store } from "./types";

// Development store kept in process memory, used when Supabase is not configured.
// Everything is lost when the dev server restarts.
//
// Each method runs without awaiting anything between its read and its write. Node runs
// one piece of JavaScript at a time, so no other request can slip in between: the same
// guarantee the Supabase functions get from row locks.

type Tables = {
  payments: Map<string, Payment>;
  tokens: Map<string, Token>;
  analyses: Map<string, Analysis>;
  tryonJobs: Map<string, TryonJob>;
  photos: Map<string, Photo>;
  products: Map<string, Product>;
  usage: UsageEvent[];
};

// On globalThis: pages and route handlers load separate copies of this module.
const g = globalThis as unknown as { __flicksStore?: Tables };

function t(): Tables {
  g.__flicksStore ??= {
    payments: new Map(),
    tokens: new Map(),
    analyses: new Map(),
    tryonJobs: new Map(),
    photos: new Map(),
    products: new Map(seedProducts().map((p) => [p.id, p])),
    usage: [],
  };
  return g.__flicksStore;
}

const now = () => new Date().toISOString();
const find = <T>(m: Map<string, T>, pred: (v: T) => boolean) => {
  for (const v of m.values()) if (pred(v)) return v;
  return null;
};
const meta = (p: Photo): PhotoMeta => {
  const { bytes, ...rest } = p;
  void bytes;
  return rest;
};

function latestPayment(sessionHash: string) {
  let latest: Payment | null = null;
  for (const p of t().payments.values()) {
    if (p.sessionHash === sessionHash && (!latest || p.createdAt > latest.createdAt)) latest = p;
  }
  return latest;
}

export const memoryStore: Store = {
  kind: "memory",

  async insertPayment(p) {
    if (find(t().payments, (x) => x.providerReference === p.providerReference)) {
      throw new Error("duplicate provider_reference");
    }
    t().payments.set(p.id, p);
    return p;
  },
  async paymentByReference(ref) {
    return find(t().payments, (p) => p.providerReference === ref);
  },
  async latestPaymentForSession(sessionHash) {
    return latestPayment(sessionHash);
  },
  async settlePayment(paymentId, tokenId) {
    const p = t().payments.get(paymentId);
    if (!p || p.status === "paid" || find(t().tokens, (x) => x.paymentId === paymentId)) return false;
    const ts = now();
    t().payments.set(paymentId, { ...p, status: "paid", paidAt: ts });
    t().tokens.set(tokenId, {
      id: tokenId,
      paymentId,
      status: "available",
      analysisAttempts: 0,
      reservedAt: null,
      consumedAt: null,
      createdAt: ts,
    });
    return true;
  },
  async setPaymentStatus(paymentId, status) {
    const p = t().payments.get(paymentId);
    if (p?.status === "pending") t().payments.set(paymentId, { ...p, status });
  },

  async tokenForPayment(paymentId) {
    return find(t().tokens, (x) => x.paymentId === paymentId);
  },
  async token(id) {
    return t().tokens.get(id) ?? null;
  },
  async releaseToken(id) {
    const tok = t().tokens.get(id);
    if (tok?.status === "reserved") t().tokens.set(id, { ...tok, status: "available", reservedAt: null });
  },
  async consumeToken(id) {
    const tok = t().tokens.get(id);
    if (tok?.status !== "reserved") return false;
    t().tokens.set(id, { ...tok, status: "consumed", consumedAt: now() });
    return true;
  },

  async startAnalysis(a, maxAttempts) {
    const repeat = find(t().analyses, (x) => x.idempotencyKey === a.idempotencyKey);
    if (repeat) {
      return repeat.sessionHash === a.sessionHash
        ? { kind: "existing", analysis: repeat }
        : { kind: "rejected", reason: "forbidden" };
    }
    const payment = latestPayment(a.sessionHash); // synchronous on purpose: no await in here
    const tok = payment?.status === "paid" ? find(t().tokens, (x) => x.paymentId === payment.id) : null;
    if (!tok) return { kind: "rejected", reason: "no_token" };
    if (tok.status === "consumed") return { kind: "rejected", reason: "consumed" };
    if (tok.status === "reserved") return { kind: "rejected", reason: "busy" };
    if (tok.status !== "available") return { kind: "rejected", reason: "no_token" };
    if (tok.analysisAttempts >= maxAttempts) return { kind: "rejected", reason: "attempts_exhausted" };

    const ts = now();
    t().tokens.set(tok.id, { ...tok, status: "reserved", reservedAt: ts, analysisAttempts: tok.analysisAttempts + 1 });
    const analysis: Analysis = {
      ...a,
      tokenId: tok.id,
      status: "queued",
      personalColor: null,
      bodyShape: null,
      modelMetadata: null,
      error: null,
      reportExpiresAt: null,
      createdAt: ts,
      completedAt: null,
    };
    t().analyses.set(analysis.id, analysis);
    return { kind: "created", analysis };
  },
  async analysis(id) {
    return t().analyses.get(id) ?? null;
  },
  async analysisBySecretHash(hash) {
    return find(t().analyses, (a) => a.reportSecretHash === hash);
  },
  async latestAnalysisForToken(tokenId) {
    let latest: Analysis | null = null;
    for (const a of t().analyses.values()) {
      if (a.tokenId === tokenId && (!latest || a.createdAt >= latest.createdAt)) latest = a;
    }
    return latest;
  },
  async updateAnalysis(id, patch) {
    const a = t().analyses.get(id);
    if (!a) return null;
    const next = { ...a, ...patch };
    t().analyses.set(id, next);
    return next;
  },

  async claimTryon(job, maxAttempts) {
    const existing = find(t().tryonJobs, (j) => j.analysisId === job.analysisId);
    if (!existing) {
      t().tryonJobs.set(job.id, job);
      return { kind: "created", job };
    }
    if (existing.status !== "failed") return { kind: "existing", job: existing };
    if (existing.attempts >= maxAttempts) return { kind: "rejected", reason: "attempts_exhausted" };
    const retry: TryonJob = {
      ...existing,
      productId: job.productId,
      status: "queued",
      error: null,
      providerJobId: null,
      attempts: existing.attempts + 1,
    };
    t().tryonJobs.set(retry.id, retry);
    return { kind: "retry", job: retry };
  },
  async tryonJob(id) {
    return t().tryonJobs.get(id) ?? null;
  },
  async tryonJobForAnalysis(analysisId) {
    return find(t().tryonJobs, (j) => j.analysisId === analysisId);
  },
  async updateTryonJob(id, patch) {
    const j = t().tryonJobs.get(id);
    if (!j) return null;
    const next = { ...j, ...patch };
    t().tryonJobs.set(id, next);
    return next;
  },

  async savePhoto(p) {
    t().photos.set(p.id, p);
    return meta(p);
  },
  async photoMeta(id) {
    const p = t().photos.get(id);
    return p ? meta(p) : null;
  },
  async photo(id) {
    return t().photos.get(id) ?? null;
  },
  async deletePhotos(ids) {
    for (const id of ids) t().photos.delete(id);
  },
  async purgeExpiredPhotos() {
    const cutoff = now();
    for (const [id, p] of t().photos) if (p.expiresAt < cutoff) t().photos.delete(id);
  },

  async activeProducts() {
    return [...t().products.values()].filter((p) => p.isActive);
  },
  async product(id) {
    return t().products.get(id) ?? null;
  },

  async logUsage(e) {
    t().usage.push(e);
  },
};
