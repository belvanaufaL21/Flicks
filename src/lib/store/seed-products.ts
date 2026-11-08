import type { Product } from "@/types/domain";

// Starter catalog built from the product photos already in /public. Jessica's curated
// catalog replaces this once the admin CRUD (P1) exists.
export function seedProducts(): Product[] {
  const ts = "2026-11-09T00:00:00.000Z";
  const base = { brand: "FLICKS Sample", sourceUrl: null, isActive: true, createdAt: ts, updatedAt: ts };
  return [
    {
      ...base,
      id: "prd_basic_tee",
      name: "Basic Tee",
      category: "Atasan",
      subcategory: "Kaos",
      imagePath: "/images/product-basic-tee.webp",
      labels: { colors: ["netral"], silhouette: ["regular fit", "crew neck"], fashnCategory: "tops" },
    },
    {
      ...base,
      id: "prd_knit_top",
      name: "Knit Top",
      category: "Atasan",
      subcategory: "Rajut",
      imagePath: "/images/product-knit-top.webp",
      labels: { colors: ["hangat"], silhouette: ["slim fit"], fashnCategory: "tops" },
    },
    {
      ...base,
      id: "prd_linen_shirt",
      name: "Linen Shirt",
      category: "Atasan",
      subcategory: "Kemeja",
      imagePath: "/images/product-linen-shirt.webp",
      labels: { colors: ["netral"], silhouette: ["relaxed fit", "kerah"], fashnCategory: "tops" },
    },
    {
      ...base,
      id: "prd_wrap_blouse",
      name: "Wrap Blouse",
      category: "Atasan",
      subcategory: "Blus",
      imagePath: "/images/product-wrap-blouse.webp",
      labels: { colors: ["hangat"], silhouette: ["wrap", "v-neck"], fashnCategory: "tops" },
    },
  ];
}
