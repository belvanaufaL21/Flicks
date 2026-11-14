import { connection } from "next/server";
import { json } from "@/lib/http/respond";
import { getStore } from "@/lib/store";

// Only active products are listed or selectable (WEB-07).
export async function GET() {
  await connection();
  return json(
    (await getStore().activeProducts()).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      image: p.imagePath,
      silhouette: p.labels.silhouette,
      sourceUrl: p.sourceUrl ?? null,
    })),
  );
}
