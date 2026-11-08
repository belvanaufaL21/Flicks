// Display names shared by the analyze flow and the report. Safe for client components.

export const seasonLabel: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
  unknown: "Belum dapat ditentukan",
};

export const subSeasonLabel = (s: string) =>
  s
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const shapeLabel: Record<string, string> = {
  rectangle: "Rectangle",
  pear: "Pear",
  hourglass: "Hourglass",
  inverted_triangle: "Inverted Triangle",
  unknown: "Belum dapat ditentukan",
};

export const shapeImage: Record<string, string | undefined> = {
  rectangle: "/images/shape-rectangle.webp",
  pear: "/images/shape-pear.webp",
  hourglass: "/images/shape-hourglass.webp",
  inverted_triangle: "/images/shape-inverted.webp",
};

export const confidenceLabel: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

export const traitLabel: Record<string, string> = {
  warm: "Hangat",
  cool: "Dingin",
  neutral: "Netral",
  light: "Terang",
  medium: "Sedang",
  deep: "Gelap",
  low: "Rendah",
  high: "Tinggi",
  uncertain: "Tidak pasti",
};

export const qualityLabel: Record<string, string> = {
  good: "Baik",
  acceptable: "Cukup",
  poor: "Kurang",
  uncertain: "Tidak pasti",
  fitted: "Pas badan",
  loose: "Longgar",
};

export const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
