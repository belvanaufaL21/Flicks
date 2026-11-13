import { cookies } from "next/headers";
import { config } from "./config";
import { newSecret, sha256 } from "./security";

// Accountless MVP: an httpOnly cookie ties a browser to its purchase while the flow is
// in progress. Only the hash is stored server-side. Once the report exists, its secret
// link is what grants access, from any device.

const SESSION_COOKIE = "flicks_session";
const REPORT_COOKIE = "flicks_report";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  path: "/",
  maxAge: 72 * 60 * 60,
};

export async function readSessionHash() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? sha256(value) : null;
}

/** Route handlers only: creates the session cookie when it does not exist yet. */
export async function ensureSessionHash() {
  const jar = await cookies();
  let value = jar.get(SESSION_COOKIE)?.value;
  if (!value) {
    value = newSecret();
    jar.set(SESSION_COOKIE, value, cookieOptions);
  }
  return sha256(value);
}

export async function rememberReportSecret(secret: string) {
  (await cookies()).set(REPORT_COOKIE, secret, cookieOptions);
}

export async function readReportSecret() {
  return (await cookies()).get(REPORT_COOKIE)?.value ?? null;
}

export async function clearFlowCookies() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(REPORT_COOKIE);
}
