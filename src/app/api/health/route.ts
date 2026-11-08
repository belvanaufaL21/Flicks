import { connection } from "next/server";
import { config } from "@/lib/config";
import { json } from "@/lib/http/respond";
import { getStore } from "@/lib/store";

export async function GET() {
  await connection();
  return json({
    status: "ok",
    paidFeaturesEnabled: config.paidFeaturesEnabled,
    providers: { openrouter: config.openrouter.mode, fashn: config.fashn.mode, midtrans: config.midtrans.mode },
    store: getStore().kind,
  });
}
