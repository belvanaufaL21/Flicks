import type { BodyShapeResult, PersonalColorResult } from "@/lib/validation/analysis-schema";

export type PaymentStatus = "pending" | "paid" | "expired" | "failed";
export type TokenStatus = "available" | "reserved" | "consumed" | "void";
export type AnalysisStatus = "queued" | "processing" | "completed" | "needs_retake" | "failed";
export type TryonStatus = "queued" | "processing" | "completed" | "failed";
export type PhotoKind = "face" | "body" | "tryon";

export type Payment = {
  id: string;
  provider: "midtrans" | "mock";
  /** Midtrans order_id. Unique, so a repeated webhook can never issue a second token. */
  providerReference: string;
  sessionHash: string;
  amount: number;
  currency: "IDR";
  status: PaymentStatus;
  /** Midtrans payment page (Snap) that shows the QRIS code. Stored in the qr_url column. */
  paymentUrl: string | null;
  qrString: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type Token = {
  id: string;
  /** Unique: one payment issues exactly one token. */
  paymentId: string;
  status: TokenStatus;
  analysisAttempts: number;
  reservedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
};

export type Analysis = {
  id: string;
  tokenId: string;
  sessionHash: string;
  idempotencyKey: string;
  status: AnalysisStatus;
  facePhotoId: string;
  bodyPhotoId: string;
  personalColor: PersonalColorResult | null;
  bodyShape: BodyShapeResult | null;
  modelMetadata: { provider: "openrouter" | "mock"; model: string; durationMs: number; costUsd?: number | null } | null;
  error: string | null;
  /** SHA-256 of the report secret. The secret itself is never stored. */
  reportSecretHash: string;
  reportExpiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type TryonJob = {
  id: string;
  analysisId: string;
  productId: string;
  idempotencyKey: string;
  provider: "fashn" | "mock";
  providerJobId: string | null;
  status: TryonStatus;
  resultPhotoId: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type Photo = {
  id: string;
  kind: PhotoKind;
  mime: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  createdAt: string;
  expiresAt: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  /** Path under /public for the seed catalog; a storage path once Supabase is wired. */
  imagePath: string;
  sourceUrl: string | null;
  labels: { colors: string[]; silhouette: string[]; fashnCategory: "tops" | "bottoms" | "one-pieces" };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UsageEvent = {
  id: string;
  provider: "openrouter" | "fashn" | "midtrans" | "mock";
  feature: "personal_color" | "body_shape" | "virtual_try_on" | "payment";
  jobId: string;
  estimatedCostIdr: number;
  status: "success" | "error";
  detail: string | null;
  timestamp: string;
};
