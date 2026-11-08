import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireMediaSecret } from "./config";

/** 256 bits of entropy, URL-safe. Used for report links and session cookies. */
export function newSecret() {
  return randomBytes(32).toString("base64url");
}

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Private photos are only reachable through short-lived signed URLs (QA-12).
const MEDIA_URL_TTL_S = 10 * 60;

function mediaSignature(photoId: string, exp: number) {
  return createHmac("sha256", requireMediaSecret()).update(`${photoId}.${exp}`).digest("base64url");
}

export function signedMediaUrl(photoId: string) {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_S;
  return `/api/media/${photoId}?exp=${exp}&sig=${mediaSignature(photoId, exp)}`;
}

export function verifyMediaSignature(photoId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < Date.now()) return false;
  return safeEqual(sig, mediaSignature(photoId, expNum));
}

// Fixed-window rate limit per client and route. In-memory, so it only holds for a
// single server instance; move it to the database or a KV store before scaling out.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
