// Photo validation that runs on the server before any paid provider is called
// (WEB-03, QA-02). The browser checks the same limits first, but the browser is
// never trusted: the type is read from the file's bytes, not from its name or header.

export const PHOTO_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  minShortSide: 512,
  maxLongSide: 8000,
  mimes: ["image/jpeg", "image/png", "image/webp"] as const,
};

export type ImageInfo = { mime: (typeof PHOTO_LIMITS.mimes)[number]; width: number; height: number };

export class PhotoError extends Error {}

export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  const u16be = (o: number) => (b[o] << 8) | b[o + 1];
  const u16le = (o: number) => b[o] | (b[o + 1] << 8);
  const u24le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const u32be = (o: number) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

  // PNG: signature, then the IHDR chunk holds width and height.
  if (b.length > 24 && b[0] === 0x89 && ascii(1, 3) === "PNG") {
    return { mime: "image/png", width: u32be(16), height: u32be(20) };
  }

  // JPEG: walk the segments until a start-of-frame marker.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1];
      if (marker === 0xff) {
        o += 1;
        continue;
      }
      const len = u16be(o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { mime: "image/jpeg", width: u16be(o + 7), height: u16be(o + 5) };
      o += 2 + len;
    }
    return null;
  }

  // WebP: RIFF container with a VP8, VP8L or VP8X chunk.
  if (b.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { mime: "image/webp", width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
  }

  return null;
}

export function validatePhoto(bytes: Uint8Array, label: string): ImageInfo {
  if (bytes.length === 0) throw new PhotoError(`${label}: file kosong.`);
  if (bytes.length > PHOTO_LIMITS.maxBytes) throw new PhotoError(`${label}: ukuran file lebih dari 8 MB.`);

  const info = inspectImage(bytes);
  if (!info) throw new PhotoError(`${label}: format tidak didukung. Gunakan JPG, PNG, atau WebP.`);

  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < PHOTO_LIMITS.minShortSide) {
    throw new PhotoError(`${label}: resolusi terlalu kecil (minimal ${PHOTO_LIMITS.minShortSide} px di sisi terpendek).`);
  }
  if (long > PHOTO_LIMITS.maxLongSide) throw new PhotoError(`${label}: resolusi terlalu besar.`);
  return info;
}
