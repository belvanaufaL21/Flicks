import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Analysis, Payment, Photo, Product, Token, TryonJob, UsageEvent } from "@/types/domain";
import { rowToProduct } from "./product-mapper";
import { seedProducts } from "./seed-products";
import type { PhotoMeta, Store } from "./types";

// ponytail: KV-backed persistent store on Supabase system_settings and user-photos bucket.
// Designed for serverless zero-downtime demo mode without colliding with Architecture B admin schema (UUID PKs).
// Upgrade path: migrate to 20261109000000_core_schema.sql once dual-schema consolidation is complete.

const BUCKET = "user-photos";
const SETTINGS_KEY = "flicks_demo_store";

type Tables = {
  payments: Map<string, Payment>;
  tokens: Map<string, Token>;
  analyses: Map<string, Analysis>;
  tryonJobs: Map<string, TryonJob>;
  photos: Map<string, Photo>;
  products: Map<string, Product>;
  usage: UsageEvent[];
};

type SerializedState = {
  payments: Payment[];
  tokens: Token[];
  analyses: Analysis[];
  tryonJobs: TryonJob[];
  photos: PhotoMeta[];
  usage: UsageEvent[];
};

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

export function createSupabaseKvStore(url: string, secretKey: string, client?: SupabaseClient): Store {
  const db: SupabaseClient = client ?? createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables: Tables = {
    payments: new Map(),
    tokens: new Map(),
    analyses: new Map(),
    tryonJobs: new Map(),
    photos: new Map(),
    products: new Map(seedProducts().map((p) => [p.id, p])),
    usage: [],
  };

  async function load(): Promise<void> {
    try {
      const { data, error } = await db
        .from("system_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();

      if (error || !data?.value) return;
      const remote = data.value as Partial<SerializedState>;

      for (const p of remote.payments ?? []) tables.payments.set(p.id, p);
      for (const t of remote.tokens ?? []) tables.tokens.set(t.id, t);
      for (const a of remote.analyses ?? []) tables.analyses.set(a.id, a);
      for (const j of remote.tryonJobs ?? []) tables.tryonJobs.set(j.id, j);
      for (const ph of remote.photos ?? []) {
        const existing = tables.photos.get(ph.id);
        tables.photos.set(ph.id, existing ? { ...ph, bytes: existing.bytes } : (ph as Photo));
      }
      if (Array.isArray(remote.usage)) tables.usage = remote.usage;
    } catch (err) {
      console.warn("[supabase-kv-store] load error (using memory cache):", err);
    }
  }

  async function save(): Promise<void> {
    try {
      const serialized: SerializedState = {
        payments: [...tables.payments.values()],
        tokens: [...tables.tokens.values()],
        analyses: [...tables.analyses.values()],
        tryonJobs: [...tables.tryonJobs.values()],
        photos: [...tables.photos.values()].map((p) => meta(p)),
        usage: tables.usage,
      };

      await db.from("system_settings").upsert({
        key: SETTINGS_KEY,
        value: serialized,
      });
    } catch (err) {
      console.warn("[supabase-kv-store] save error:", err);
    }
  }

  function latestPayment(sessionHash: string) {
    let latest: Payment | null = null;
    for (const p of tables.payments.values()) {
      if (p.sessionHash === sessionHash && (!latest || p.createdAt > latest.createdAt)) latest = p;
    }
    return latest;
  }

  return {
    kind: "supabase",

    async insertPayment(p) {
      await load();
      if (find(tables.payments, (x) => x.providerReference === p.providerReference)) {
        throw new Error("duplicate provider_reference");
      }
      tables.payments.set(p.id, p);
      await save();
      return p;
    },
    async paymentByReference(ref) {
      await load();
      return find(tables.payments, (p) => p.providerReference === ref);
    },
    async latestPaymentForSession(sessionHash) {
      await load();
      return latestPayment(sessionHash);
    },
    async settlePayment(paymentId, tokenId) {
      await load();
      const p = tables.payments.get(paymentId);
      if (!p || p.status === "paid" || find(tables.tokens, (x) => x.paymentId === paymentId)) return false;
      const ts = now();
      tables.payments.set(paymentId, { ...p, status: "paid", paidAt: ts });
      tables.tokens.set(tokenId, {
        id: tokenId,
        paymentId,
        status: "available",
        analysisAttempts: 0,
        reservedAt: null,
        consumedAt: null,
        createdAt: ts,
      });
      await save();
      return true;
    },
    async setPaymentStatus(paymentId, status) {
      await load();
      const p = tables.payments.get(paymentId);
      if (p?.status === "pending") {
        tables.payments.set(paymentId, { ...p, status });
        await save();
      }
    },

    async tokenForPayment(paymentId) {
      await load();
      return find(tables.tokens, (x) => x.paymentId === paymentId);
    },
    async token(id) {
      await load();
      return tables.tokens.get(id) ?? null;
    },
    async releaseToken(id) {
      await load();
      const tok = tables.tokens.get(id);
      if (tok?.status === "reserved") {
        tables.tokens.set(id, { ...tok, status: "available", reservedAt: null });
        await save();
      }
    },
    async consumeToken(id) {
      await load();
      const tok = tables.tokens.get(id);
      if (tok?.status !== "reserved") return false;
      tables.tokens.set(id, { ...tok, status: "consumed", consumedAt: now() });
      await save();
      return true;
    },

    async startAnalysis(a, maxAttempts) {
      await load();
      const repeat = find(tables.analyses, (x) => x.idempotencyKey === a.idempotencyKey);
      if (repeat) {
        return repeat.sessionHash === a.sessionHash
          ? { kind: "existing", analysis: repeat }
          : { kind: "rejected", reason: "forbidden" };
      }
      const payment = latestPayment(a.sessionHash);
      const tok = payment?.status === "paid" ? find(tables.tokens, (x) => x.paymentId === payment.id) : null;
      if (!tok) return { kind: "rejected", reason: "no_token" };
      if (tok.status === "consumed") return { kind: "rejected", reason: "consumed" };
      if (tok.status === "reserved") return { kind: "rejected", reason: "busy" };
      if (tok.status !== "available") return { kind: "rejected", reason: "no_token" };
      if (tok.analysisAttempts >= maxAttempts) return { kind: "rejected", reason: "attempts_exhausted" };

      const ts = now();
      tables.tokens.set(tok.id, { ...tok, status: "reserved", reservedAt: ts, analysisAttempts: tok.analysisAttempts + 1 });
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
      tables.analyses.set(analysis.id, analysis);
      await save();
      return { kind: "created", analysis };
    },
    async analysis(id) {
      await load();
      return tables.analyses.get(id) ?? null;
    },
    async analysisBySecretHash(hash) {
      await load();
      return find(tables.analyses, (a) => a.reportSecretHash === hash);
    },
    async latestAnalysisForToken(tokenId) {
      await load();
      let latest: Analysis | null = null;
      for (const a of tables.analyses.values()) {
        if (a.tokenId === tokenId && (!latest || a.createdAt >= latest.createdAt)) latest = a;
      }
      return latest;
    },
    async updateAnalysis(id, patch) {
      await load();
      const a = tables.analyses.get(id);
      if (!a) return null;
      const next = { ...a, ...patch };
      tables.analyses.set(id, next);
      await save();
      return next;
    },

    async claimTryon(job, maxAttempts) {
      await load();
      const existing = find(tables.tryonJobs, (j) => j.analysisId === job.analysisId);
      if (!existing) {
        tables.tryonJobs.set(job.id, job);
        await save();
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
      tables.tryonJobs.set(retry.id, retry);
      await save();
      return { kind: "retry", job: retry };
    },
    async tryonJob(id) {
      await load();
      return tables.tryonJobs.get(id) ?? null;
    },
    async tryonJobForAnalysis(analysisId) {
      await load();
      return find(tables.tryonJobs, (j) => j.analysisId === analysisId);
    },
    async updateTryonJob(id, patch) {
      await load();
      const j = tables.tryonJobs.get(id);
      if (!j) return null;
      const next = { ...j, ...patch };
      tables.tryonJobs.set(id, next);
      await save();
      return next;
    },

    async savePhoto(p) {
      const path = `${p.kind}/${p.id}`;
      try {
        await db.storage.from(BUCKET).upload(path, p.bytes, { contentType: p.mime, upsert: true });
      } catch (err) {
        console.warn("[supabase-kv-store] photo storage upload warning:", err);
      }
      tables.photos.set(p.id, p);
      await save();
      return meta(p);
    },
    async photoMeta(id) {
      await load();
      const p = tables.photos.get(id);
      return p ? meta(p) : null;
    },
    async photo(id) {
      await load();
      const p = tables.photos.get(id);
      if (!p) return null;
      if (p.bytes && p.bytes.length > 0) return p;

      const path = `${p.kind}/${p.id}`;
      try {
        const { data, error } = await db.storage.from(BUCKET).download(path);
        if (!error && data) {
          const bytes = new Uint8Array(await data.arrayBuffer());
          const full = { ...p, bytes };
          tables.photos.set(id, full);
          return full;
        }
      } catch (err) {
        console.warn("[supabase-kv-store] photo storage download warning:", err);
      }
      return p.bytes ? p : null;
    },
    async deletePhotos(ids) {
      await load();
      const paths: string[] = [];
      for (const id of ids) {
        const p = tables.photos.get(id);
        if (p) paths.push(`${p.kind}/${p.id}`);
        tables.photos.delete(id);
      }
      if (paths.length > 0) {
        try {
          await db.storage.from(BUCKET).remove(paths);
        } catch (err) {
          console.warn("[supabase-kv-store] photo storage remove warning:", err);
        }
      }
      await save();
    },
    async purgeExpiredPhotos() {
      await load();
      const cutoff = now();
      const toDelete: string[] = [];
      for (const [id, p] of tables.photos) {
        if (p.expiresAt < cutoff) toDelete.push(id);
      }
      if (toDelete.length > 0) {
        await this.deletePhotos(toDelete);
      }
    },

    async activeProducts() {
      try {
        const { data, error } = await db
          .from("products")
          .select()
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map((r) => rowToProduct(r as Record<string, unknown>));
        }
      } catch (err) {
        console.warn("[supabase-kv-store] activeProducts db warning (falling back to memory):", err);
      }
      return [...tables.products.values()].filter((p) => p.isActive);
    },
    async product(id) {
      try {
        const { data, error } = await db
          .from("products")
          .select()
          .eq("id", id)
          .maybeSingle();
        if (!error && data) {
          return rowToProduct(data as Record<string, unknown>);
        }
      } catch (err) {
        console.warn("[supabase-kv-store] product db warning (falling back to memory):", err);
      }
      return tables.products.get(id) ?? null;
    },

    async logUsage(e) {
      tables.usage.push(e);
      await save();
    },
  };
}
