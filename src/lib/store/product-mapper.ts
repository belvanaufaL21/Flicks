import type { Product } from "@/types/domain";

// ponytail: rule-based category normalization for Indonesian UI ("Atasan" / "Bawahan") and FASHN API ("tops" / "bottoms").
// Upgrade path: migrate to structured taxonomy table once multi-tier catalog is implemented.

export function isBottomsCategory(cat?: string | null, sub?: string | null): boolean {
  const c = (cat || "").trim().toLowerCase();
  const s = (sub || "").trim().toLowerCase();
  return (
    c === "bottoms" ||
    c === "bottom" ||
    c === "bawahan" ||
    c === "celana" ||
    c === "pants" ||
    c === "trousers" ||
    c === "rok" ||
    c === "skirt" ||
    c === "shorts" ||
    s.includes("bawahan") ||
    s.includes("celana") ||
    s.includes("rok")
  );
}

export function isOnePieceCategory(cat?: string | null, sub?: string | null): boolean {
  const c = (cat || "").trim().toLowerCase();
  const s = (sub || "").trim().toLowerCase();
  return (
    c === "one-pieces" ||
    c === "one_piece" ||
    c === "dress" ||
    c === "gaun" ||
    c === "terusan" ||
    s.includes("terusan") ||
    s.includes("gaun")
  );
}

export function mapCategoryToDisplay(cat?: string | null, sub?: string | null): string {
  if (isBottomsCategory(cat, sub)) return "Bawahan";
  if (isOnePieceCategory(cat, sub)) return "Terusan";
  return "Atasan";
}

export function mapCategoryToFashn(cat?: string | null, sub?: string | null): "tops" | "bottoms" | "one-pieces" {
  if (isBottomsCategory(cat, sub)) return "bottoms";
  if (isOnePieceCategory(cat, sub)) return "one-pieces";
  return "tops";
}

export function rowToProduct(r: Record<string, unknown>): Product {
  const rawCat = typeof r.category === "string" ? r.category : "tops";
  const rawSub = typeof r.subcategory === "string" ? r.subcategory : "";
  const displayCat = mapCategoryToDisplay(rawCat, rawSub);
  const fashnCat = mapCategoryToFashn(rawCat, rawSub);

  const rawLabels = (typeof r.labels === "object" && r.labels !== null ? r.labels : {}) as Record<string, unknown>;
  const colors: string[] = Array.isArray(rawLabels.colors)
    ? (rawLabels.colors as string[])
    : Array.isArray(rawLabels.color_tones)
      ? (rawLabels.color_tones as string[])
      : ["netral"];
  const silhouette: string[] = Array.isArray(rawLabels.silhouette)
    ? (rawLabels.silhouette as string[])
    : Array.isArray(rawLabels.body_shapes)
      ? (rawLabels.body_shapes as string[])
      : ["regular fit"];

  const fashnCategory =
    rawLabels.fashnCategory === "tops" ||
    rawLabels.fashnCategory === "bottoms" ||
    rawLabels.fashnCategory === "one-pieces"
      ? (rawLabels.fashnCategory as "tops" | "bottoms" | "one-pieces")
      : fashnCat;

  const imagePath =
    (typeof r.image_path === "string" ? r.image_path : null) ||
    (typeof r.imagePath === "string" ? r.imagePath : null) ||
    "";

  return {
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "Produk",
    brand: typeof r.brand === "string" && r.brand.trim() ? r.brand : "FLICKS",
    category: displayCat,
    subcategory: rawSub || (displayCat === "Bawahan" ? "Bawahan" : "Atasan"),
    imagePath,
    sourceUrl:
      (typeof r.source_url === "string" ? r.source_url : null) ||
      (typeof r.sourceUrl === "string" ? r.sourceUrl : null) ||
      null,
    labels: {
      colors,
      silhouette,
      fashnCategory,
    },
    isActive: r.is_active !== false && r.isActive !== false,
    createdAt:
      (typeof r.created_at === "string" ? r.created_at : null) ||
      (typeof r.createdAt === "string" ? r.createdAt : null) ||
      new Date().toISOString(),
    updatedAt:
      (typeof r.updated_at === "string" ? r.updated_at : null) ||
      (typeof r.updatedAt === "string" ? r.updatedAt : null) ||
      new Date().toISOString(),
  };
}
