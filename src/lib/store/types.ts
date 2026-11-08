import type { Analysis, Payment, Photo, Product, Token, TryonJob, UsageEvent } from "@/types/domain";

// The one data-access contract the services use. Two implementations:
// memory-store.ts for development without a database, supabase-store.ts otherwise.
//
// The methods that guard money (issuing, reserving, consuming a token, and claiming a
// try-on job) are single atomic operations here, never a read followed by a write in
// the service. In Supabase each one is a SQL function that takes a row lock.

export type PhotoMeta = Omit<Photo, "bytes">;

export type NewAnalysis = Pick<
  Analysis,
  "id" | "idempotencyKey" | "sessionHash" | "facePhotoId" | "bodyPhotoId" | "reportSecretHash"
>;

export type StartAnalysisResult =
  | { kind: "created" | "existing"; analysis: Analysis }
  | { kind: "rejected"; reason: "forbidden" | "no_token" | "consumed" | "busy" | "attempts_exhausted" };

export type ClaimTryonResult =
  | { kind: "created" | "retry" | "existing"; job: TryonJob }
  | { kind: "rejected"; reason: "attempts_exhausted" };

export interface Store {
  readonly kind: "memory" | "supabase";

  insertPayment(p: Payment): Promise<Payment>;
  paymentByReference(ref: string): Promise<Payment | null>;
  latestPaymentForSession(sessionHash: string): Promise<Payment | null>;
  /** pending -> paid plus exactly one token. False when already settled (duplicate webhook). */
  settlePayment(paymentId: string, tokenId: string): Promise<boolean>;
  /** Only moves a payment that is still pending. */
  setPaymentStatus(paymentId: string, status: "expired" | "failed"): Promise<void>;

  tokenForPayment(paymentId: string): Promise<Token | null>;
  token(id: string): Promise<Token | null>;
  /** reserved -> available. */
  releaseToken(id: string): Promise<void>;
  /** reserved -> consumed. False when the token was not reserved. */
  consumeToken(id: string): Promise<boolean>;

  /**
   * In one step: return the analysis for a repeated idempotency key, or reserve the
   * session's token (available -> reserved) and create the analysis.
   */
  startAnalysis(a: NewAnalysis, maxAttempts: number): Promise<StartAnalysisResult>;
  analysis(id: string): Promise<Analysis | null>;
  analysisBySecretHash(hash: string): Promise<Analysis | null>;
  latestAnalysisForToken(tokenId: string): Promise<Analysis | null>;
  updateAnalysis(id: string, patch: Partial<Analysis>): Promise<Analysis | null>;

  /** Creates the analysis's one try-on job, or re-queues it after a failure, or returns it. */
  claimTryon(job: TryonJob, maxAttempts: number): Promise<ClaimTryonResult>;
  tryonJob(id: string): Promise<TryonJob | null>;
  tryonJobForAnalysis(analysisId: string): Promise<TryonJob | null>;
  updateTryonJob(id: string, patch: Partial<TryonJob>): Promise<TryonJob | null>;

  savePhoto(p: Photo): Promise<PhotoMeta>;
  photoMeta(id: string): Promise<PhotoMeta | null>;
  /** Metadata plus the file itself. */
  photo(id: string): Promise<Photo | null>;
  deletePhotos(ids: string[]): Promise<void>;
  /** Retention: removes every photo past its expiry (QA-14). */
  purgeExpiredPhotos(): Promise<void>;

  activeProducts(): Promise<Product[]>;
  product(id: string): Promise<Product | null>;

  logUsage(e: UsageEvent): Promise<void>;
}
