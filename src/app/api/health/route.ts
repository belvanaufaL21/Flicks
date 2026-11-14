import { connection } from "next/server";
import { config, missingSettings } from "@/lib/config";
import { json } from "@/lib/http/respond";
import { getStore, storeAvailable } from "@/lib/store";

// Deployment check. Lists the NAMES of settings production still needs (never their
// values), so a fresh deployment shows what to add instead of failing with a 500.
export async function GET() {
  await connection();
  const missing = missingSettings();
  return json({
    status: missing.length ? "incomplete" : "ok",
    salesOpen: config.paidFeaturesEnabled && missing.length === 0,
    missingSettings: missing,
    providers: { openrouter: config.openrouter.mode, fashn: config.fashn.mode, midtrans: config.midtrans.mode },
    store: storeAvailable() ? getStore().kind : "not configured",
  });
}
