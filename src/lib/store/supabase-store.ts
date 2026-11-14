import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Analysis, Payment, Photo, Product, Token, TryonJob } from "@/types/domain";
import type { PhotoMeta, Store } from "./types";

// Supabase-backed store. Server-only: it uses the secret key, which bypasses RLS.
// Tables and functions come from supabase/migrations. Photo files live in the private
// "user-photos" bucket; the photos table holds their metadata and storage path.

const BUCKET = "user-photos";

type Row = Record<string, unknown>;

// Rows are snake_case, the domain is camelCase. Explicit maps keep the two in step.
const toPayment = (r: Row): Payment => ({
  id: r.id as string,
  provider: r.provider as Payment["provider"],
  providerReference: r.provider_reference as string,
  sessionHash: r.session_hash as string,
  amount: r.amount as number,
  currency: "IDR",
  status: r.status as Payment["status"],
  paymentUrl: (r.qr_url as string) ?? null,
  qrString: (r.qr_string as string) ?? null,
  expiresAt: (r.expires_at as string) ?? null,
  createdAt: r.created_at as string,
  paidAt: (r.paid_at as string) ?? null,
});
const fromPayment = (p: Payment): Row => ({
  id: p.id,
  provider: p.provider,
  provider_reference: p.providerReference,
  session_hash: p.sessionHash,
  amount: p.amount,
  currency: p.currency,
  status: p.status,
  qr_url: p.paymentUrl,
  qr_string: p.qrString,
  expires_at: p.expiresAt,
  created_at: p.createdAt,
  paid_at: p.paidAt,
});

const toToken = (r: Row): Token => ({
  id: r.id as string,
  paymentId: r.payment_id as string,
  status: r.status as Token["status"],
  analysisAttempts: r.analysis_attempts as number,
  reservedAt: (r.reserved_at as string) ?? null,
  consumedAt: (r.consumed_at as string) ?? null,
  createdAt: r.created_at as string,
});

const toAnalysis = (r: Row): Analysis => ({
  id: r.id as string,
  tokenId: r.token_id as string,
  sessionHash: r.session_hash as string,
  idempotencyKey: r.idempotency_key as string,
  status: r.status as Analysis["status"],
  facePhotoId: r.face_photo_id as string,
  bodyPhotoId: r.body_photo_id as string,
  personalColor: (r.personal_color_result as Analysis["personalColor"]) ?? null,
  bodyShape: (r.body_shape_result as Analysis["bodyShape"]) ?? null,
  modelMetadata: (r.model_metadata as Analysis["modelMetadata"]) ?? null,
  error: (r.error as string) ?? null,
  reportSecretHash: r.report_secret_hash as string,
  reportExpiresAt: (r.report_expires_at as string) ?? null,
  createdAt: r.created_at as string,
  completedAt: (r.completed_at as string) ?? null,
});
const analysisPatch = (p: Partial<Analysis>): Row => {
  const map: Record<string, string> = {
    status: "status",
    personalColor: "personal_color_result",
    bodyShape: "body_shape_result",
    modelMetadata: "model_metadata",
    error: "error",
    reportExpiresAt: "report_expires_at",
    completedAt: "completed_at",
  };
  return renamePatch(p, map);
};

const toJob = (r: Row): TryonJob => ({
  id: r.id as string,
  analysisId: r.analysis_id as string,
  productId: r.product_id as string,
  idempotencyKey: r.idempotency_key as string,
  provider: r.provider as TryonJob["provider"],
  providerJobId: (r.provider_job_id as string) ?? null,
  status: r.status as TryonJob["status"],
  resultPhotoId: (r.result_photo_id as string) ?? null,
  attempts: r.attempts as number,
  error: (r.error as string) ?? null,
  createdAt: r.created_at as string,
  completedAt: (r.completed_at as string) ?? null,
});
const fromJob = (j: TryonJob): Row => ({
  id: j.id,
  analysis_id: j.analysisId,
  product_id: j.productId,
  idempotency_key: j.idempotencyKey,
  provider: j.provider,
  provider_job_id: j.providerJobId,
  status: j.status,
  result_photo_id: j.resultPhotoId,
  attempts: j.attempts,
  error: j.error,
  created_at: j.createdAt,
  completed_at: j.completedAt,
});
const jobPatch = (p: Partial<TryonJob>): Row =>
  renamePatch(p, {
    providerJobId: "provider_job_id",
    status: "status",
    resultPhotoId: "result_photo_id",
    error: "error",
    completedAt: "completed_at",
    attempts: "attempts",
    productId: "product_id",
  });

const toPhotoMeta = (r: Row): PhotoMeta => ({
  id: r.id as string,
  kind: r.kind as PhotoMeta["kind"],
  mime: r.mime as string,
  width: r.width as number,
  height: r.height as number,
  createdAt: r.created_at as string,
  expiresAt: r.expires_at as string,
});

const toProduct = (r: Row): Product => ({
  id: r.id as string,
  name: r.name as string,
  brand: r.brand as string,
  category: r.category as string,
  subcategory: r.subcategory as string,
  imagePath: r.image_path as string,
  sourceUrl: (r.source_url as string) ?? null,
  labels: r.labels as Product["labels"],
  isActive: r.is_active as boolean,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

function renamePatch(patch: object, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in map)) throw new Error(`Field ${k} cannot be updated`);
    out[map[k]] = v;
  }
  return out;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what}: ${res.error.message}`);
  return res.data;
}

function many<T>(res: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new Error(`Supabase ${what}: ${res.error.message}`);
  return res.data ?? [];
}

const storagePath = (p: { id: string; kind: string }) => `${p.kind}/${p.id}`;

export function createSupabaseStore(url: string, secretKey: string): Store {
  const db: SupabaseClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const one = async <T>(query: PromiseLike<{ data: Row | null; error: { message: string } | null }>, map: (r: Row) => T, what: string) => {
    const row = must(await query, what);
    return row ? map(row) : null;
  };

  async function analysisById(id: string) {
    return one(db.from("analyses").select().eq("id", id).maybeSingle(), toAnalysis, "analysis");
  }
  async function jobById(id: string) {
    return one(db.from("tryon_jobs").select().eq("id", id).maybeSingle(), toJob, "tryon job");
  }

  return {
    kind: "supabase",

    async insertPayment(p) {
      return toPayment(must(await db.from("payments").insert(fromPayment(p)).select().single(), "insert payment")!);
    },
    async paymentByReference(ref) {
      return one(db.from("payments").select().eq("provider_reference", ref).maybeSingle(), toPayment, "payment");
    },
    async latestPaymentForSession(sessionHash) {
      return one(
        db.from("payments").select().eq("session_hash", sessionHash).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        toPayment,
        "latest payment",
      );
    },
    async settlePayment(paymentId, tokenId) {
      return must(await db.rpc("settle_payment", { p_payment_id: paymentId, p_token_id: tokenId }), "settle_payment") === true;
    },
    async setPaymentStatus(paymentId, status) {
      must(await db.from("payments").update({ status }).eq("id", paymentId).eq("status", "pending"), "payment status");
    },

    async tokenForPayment(paymentId) {
      return one(db.from("tokens").select().eq("payment_id", paymentId).maybeSingle(), toToken, "token");
    },
    async token(id) {
      return one(db.from("tokens").select().eq("id", id).maybeSingle(), toToken, "token");
    },
    async releaseToken(id) {
      must(
        await db.from("tokens").update({ status: "available", reserved_at: null }).eq("id", id).eq("status", "reserved"),
        "release token",
      );
    },
    async consumeToken(id) {
      const rows = many(
        await db
          .from("tokens")
          .update({ status: "consumed", consumed_at: new Date().toISOString() })
          .eq("id", id)
          .eq("status", "reserved")
          .select("id"),
        "consume token",
      );
      return (rows ?? []).length === 1;
    },

    async startAnalysis(a, maxAttempts) {
      const result = must(
        await db.rpc("start_analysis", {
          p_id: a.id,
          p_session_hash: a.sessionHash,
          p_idempotency_key: a.idempotencyKey,
          p_face_photo_id: a.facePhotoId,
          p_body_photo_id: a.bodyPhotoId,
          p_report_secret_hash: a.reportSecretHash,
          p_max_attempts: maxAttempts,
        }),
        "start_analysis",
      ) as { kind: "created" | "existing" | "rejected"; id?: string; reason?: string };

      if (result.kind === "rejected") {
        return { kind: "rejected", reason: result.reason as Extract<Awaited<ReturnType<Store["startAnalysis"]>>, { kind: "rejected" }>["reason"] };
      }
      const analysis = await analysisById(result.id!);
      if (!analysis) throw new Error("start_analysis returned an analysis that does not exist");
      return { kind: result.kind, analysis };
    },
    analysis: analysisById,
    async analysisBySecretHash(hash) {
      return one(db.from("analyses").select().eq("report_secret_hash", hash).maybeSingle(), toAnalysis, "analysis by secret");
    },
    async latestAnalysisForToken(tokenId) {
      return one(
        db.from("analyses").select().eq("token_id", tokenId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        toAnalysis,
        "latest analysis",
      );
    },
    async updateAnalysis(id, patch) {
      return one(db.from("analyses").update(analysisPatch(patch)).eq("id", id).select().maybeSingle(), toAnalysis, "update analysis");
    },

    async claimTryon(job, maxAttempts) {
      const result = must(
        await db.rpc("claim_tryon", { p_job: fromJob(job), p_max_attempts: maxAttempts }),
        "claim_tryon",
      ) as { kind: "created" | "retry" | "existing" | "rejected"; id?: string };
      if (result.kind === "rejected") return { kind: "rejected", reason: "attempts_exhausted" };
      const claimed = await jobById(result.id!);
      if (!claimed) throw new Error("claim_tryon returned a job that does not exist");
      return { kind: result.kind, job: claimed };
    },
    tryonJob: jobById,
    async tryonJobForAnalysis(analysisId) {
      return one(db.from("tryon_jobs").select().eq("analysis_id", analysisId).maybeSingle(), toJob, "tryon job");
    },
    async updateTryonJob(id, patch) {
      return one(db.from("tryon_jobs").update(jobPatch(patch)).eq("id", id).select().maybeSingle(), toJob, "update tryon job");
    },

    async savePhoto(p) {
      const path = storagePath(p);
      must(await db.storage.from(BUCKET).upload(path, p.bytes, { contentType: p.mime, upsert: false }), "upload photo");
      const row = await db
        .from("photos")
        .insert({
          id: p.id,
          kind: p.kind,
          mime: p.mime,
          storage_path: path,
          width: p.width,
          height: p.height,
          created_at: p.createdAt,
          expires_at: p.expiresAt,
        })
        .select()
        .single();
      if (row.error) {
        await db.storage.from(BUCKET).remove([path]);
        throw new Error(`Supabase insert photo: ${row.error.message}`);
      }
      return toPhotoMeta(row.data);
    },
    async photoMeta(id) {
      return one(db.from("photos").select().eq("id", id).maybeSingle(), toPhotoMeta, "photo");
    },
    async photo(id) {
      const row = must(await db.from("photos").select().eq("id", id).maybeSingle(), "photo");
      if (!row) return null;
      const file = await db.storage.from(BUCKET).download(row.storage_path as string);
      if (file.error) return null;
      return { ...toPhotoMeta(row), bytes: new Uint8Array(await file.data.arrayBuffer()) } satisfies Photo;
    },
    async deletePhotos(ids) {
      if (ids.length === 0) return;
      const rows = many(await db.from("photos").select("storage_path").in("id", ids), "photos to delete");
      if (rows.length) must(await db.storage.from(BUCKET).remove(rows.map((r) => r.storage_path as string)), "remove files");
      must(await db.from("photos").delete().in("id", ids), "delete photos");
    },
    async purgeExpiredPhotos() {
      const rows = many(
        await db.from("photos").select("id").lt("expires_at", new Date().toISOString()).limit(100),
        "expired photos",
      );
      await this.deletePhotos(rows.map((r) => r.id as string));
    },

    async activeProducts() {
      return many(await db.from("products").select().eq("is_active", true).order("created_at"), "products").map(toProduct);
    },
    async product(id) {
      return one(db.from("products").select().eq("id", id).maybeSingle(), toProduct, "product");
    },

    async logUsage(e) {
      const res = await db.from("usage_events").insert({
        id: e.id,
        provider: e.provider,
        feature: e.feature,
        job_id: e.jobId,
        estimated_cost: e.estimatedCostIdr,
        status: e.status,
        detail: e.detail,
        created_at: e.timestamp,
      });
      // A lost cost log must never break the user's flow.
      if (res.error) console.error("[usage] could not log", res.error.message);
    },
  };
}
