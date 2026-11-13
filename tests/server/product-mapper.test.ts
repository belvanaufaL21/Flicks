import { describe, expect, it } from "vitest";
import {
  isBottomsCategory,
  isOnePieceCategory,
  mapCategoryToDisplay,
  mapCategoryToFashn,
  rowToProduct,
} from "@/lib/store/product-mapper";

describe("product-mapper", () => {
  it("identifies bottoms correctly from category or subcategory", () => {
    expect(isBottomsCategory("bottoms")).toBe(true);
    expect(isBottomsCategory("bottom")).toBe(true);
    expect(isBottomsCategory("bawahan")).toBe(true);
    expect(isBottomsCategory("celana")).toBe(true);
    expect(isBottomsCategory("rok")).toBe(true);
    expect(isBottomsCategory("tops", "Bawahan")).toBe(true);
    expect(isBottomsCategory("tops")).toBe(false);
  });

  it("identifies one-piece / dresses correctly", () => {
    expect(isOnePieceCategory("dress")).toBe(true);
    expect(isOnePieceCategory("one-pieces")).toBe(true);
    expect(isOnePieceCategory("gaun")).toBe(true);
    expect(isOnePieceCategory("tops")).toBe(false);
  });

  it("maps categories to UI display labels (Atasan / Bawahan)", () => {
    expect(mapCategoryToDisplay("tops")).toBe("Atasan");
    expect(mapCategoryToDisplay("bottoms")).toBe("Bawahan");
    expect(mapCategoryToDisplay("celana")).toBe("Bawahan");
    expect(mapCategoryToDisplay("dress")).toBe("Terusan");
  });

  it("maps categories to FASHN API category names", () => {
    expect(mapCategoryToFashn("tops")).toBe("tops");
    expect(mapCategoryToFashn("bottoms")).toBe("bottoms");
    expect(mapCategoryToFashn("dress")).toBe("one-pieces");
  });

  it("converts Supabase product row into domain Product structure", () => {
    const row = {
      id: "6bc42484-5df8-4d86-9983-3c25c402ce76",
      name: "Burgundy Ruched Gown",
      brand: "V.Y.R.A Store",
      category: "tops",
      subcategory: "Atasan",
      image_path: "https://weozqxrhhxdypnzepeud.supabase.co/storage/v1/object/public/product-images/products/6bc42484-5df8-4d86-9983-3c25c402ce76/1773099042603-51ywn9q376w.png",
      labels: {
        preview_url: "https://example.com/preview",
        sizes: ["All Size"],
        gender: "unisex",
        body_shapes: ["hourglass"],
        color_tones: ["warm"],
      },
      is_active: true,
      created_at: "2026-03-09T18:10:43.087413+00:00",
      updated_at: "2026-03-09T18:10:43.087413+00:00",
    };

    const product = rowToProduct(row);
    expect(product.id).toBe("6bc42484-5df8-4d86-9983-3c25c402ce76");
    expect(product.name).toBe("Burgundy Ruched Gown");
    expect(product.brand).toBe("V.Y.R.A Store");
    expect(product.category).toBe("Atasan");
    expect(product.subcategory).toBe("Atasan");
    expect(product.imagePath).toBe(row.image_path);
    expect(product.labels.fashnCategory).toBe("tops");
    expect(product.labels.colors).toEqual(["warm"]);
    expect(product.labels.silhouette).toEqual(["hourglass"]);
    expect(product.isActive).toBe(true);
  });

  it("converts bottoms product correctly", () => {
    const row = {
      id: "a9d9656f-93e7-4723-b82f-21bfe68cd2ca",
      name: "Celana Wanita Bagus",
      brand: "Wear Label",
      category: "bottoms",
      subcategory: "Bawahan",
      image_path: "https://weozqxrhhxdypnzepeud.supabase.co/storage/v1/object/public/product-images/products/a9d9656f-93e7-4723-b82f-21bfe68cd2ca/1773099238380-z1i0853p8c.png",
      labels: null,
      is_active: true,
    };

    const product = rowToProduct(row);
    expect(product.id).toBe("a9d9656f-93e7-4723-b82f-21bfe68cd2ca");
    expect(product.category).toBe("Bawahan");
    expect(product.subcategory).toBe("Bawahan");
    expect(product.labels.fashnCategory).toBe("bottoms");
  });
});
