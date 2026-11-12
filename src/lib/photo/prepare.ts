// Browser-side photo check and auto-crop (step 2). Runs before anything is uploaded:
// - face photo: exactly one face, close enough, not too dark or bright; cropped to a
//   square around face and hair.
// - body photo: exactly one person, head to feet in frame; cropped to 3:4 around them.
// The crops are compressed JPEGs of a few hundred KB, which keeps uploads fast and
// inside Vercel's request limit. The server still validates everything again.
//
// Detection uses MediaPipe in the browser; the photo never leaves the device for it.
// The runtime and models are fetched only when step 2 is opened.

import type { FaceDetector, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type Check = { label: string; ok: boolean };
/** Points in 0..1 coordinates of the cropped photo, used for the scan animation. */
export type Point = { x: number; y: number };

export type Prepared =
  | { ok: true; blob: Blob; url: string; checks: Check[]; points: Point[]; verified: boolean }
  | { ok: false; reason: string; checks: Check[] };

type Vision = typeof import("@mediapipe/tasks-vision");

// MediaPipe's WebAssembly runtime prints its internal C++ logs to the browser console,
// some through console.error ("INFO: Created TensorFlow Lite XNNPACK delegate…"). They
// are not errors, but they read like ones (and the Next.js dev overlay counts them),
// so only those exact log formats are dropped. Everything else passes through.
let logsMuted = false;
function muteMediapipeLogs() {
  if (logsMuted) return;
  logsMuted = true;
  const isRuntimeLog = (first: unknown) =>
    typeof first === "string" && (/^INFO: /.test(first) || /^[IW]\d{4} \d{2}:\d{2}:\d{2}\.\d+ /.test(first));
  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (!isRuntimeLog(args[0])) original(...args);
    };
  }
}

let visionPromise: Promise<{ lib: Vision; fileset: Awaited<ReturnType<Vision["FilesetResolver"]["forVisionTasks"]>> }> | null = null;
function vision() {
  muteMediapipeLogs();
  visionPromise ??= (async () => {
    const lib = await import("@mediapipe/tasks-vision");
    const fileset = await lib.FilesetResolver.forVisionTasks(WASM_URL);
    return { lib, fileset };
  })();
  visionPromise.catch(() => (visionPromise = null));
  return visionPromise;
}

let facePromise: Promise<FaceDetector> | null = null;
function faceDetector() {
  facePromise ??= vision().then(({ lib, fileset }) =>
    lib.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.6,
    }),
  );
  facePromise.catch(() => (facePromise = null));
  return facePromise;
}

let posePromise: Promise<PoseLandmarker> | null = null;
function poseLandmarker() {
  posePromise ??= vision().then(({ lib, fileset }) =>
    lib.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL },
      runningMode: "IMAGE",
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
    }),
  );
  posePromise.catch(() => (posePromise = null));
  return posePromise;
}

/** Starts downloading the models early so the first check feels instant. */
export function warmUp(kind: "face" | "body") {
  (kind === "face" ? faceDetector() : poseLandmarker()).catch(() => {});
}

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };

async function decode(file: File) {
  if (!file.type.startsWith("image/") || (file.type && !TYPES.includes(file.type))) {
    throw new Error("Format harus JPG, PNG, atau WebP.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("Ukuran file terlalu besar (maksimal 20 MB).");
  try {
    // Applies the EXIF orientation, so portrait phone photos come out upright.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("File tidak bisa dibaca sebagai gambar. Coba foto JPG atau PNG.");
  }
}

/** A downscaled copy for detection: faster, and the models do not need full size. */
function detectionCanvas(bitmap: ImageBitmap, max = 1280) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Mean perceived brightness (0-255) inside a rect of the canvas. */
function brightness(canvas: HTMLCanvasElement, r: Rect) {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const w = Math.max(1, Math.min(canvas.width - x, Math.floor(r.w)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.floor(r.h)));
  const data = canvas.getContext("2d")!.getImageData(x, y, w, h).data;
  let sum = 0;
  const step = 4 * Math.max(1, Math.floor((w * h) / 20000)); // sample about 20k pixels
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return sum / n;
}

/** Fits a rect of the given aspect around `focus`, inside the image, as large as allowed. */
function fitRect(focus: Rect, aspect: number, imgW: number, imgH: number): Rect {
  let w = focus.w;
  let h = focus.h;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  // Shrink to the image if needed, keeping the aspect.
  const k = Math.min(1, imgW / w, imgH / h);
  w *= k;
  h *= k;
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  const x = Math.min(Math.max(0, cx - w / 2), imgW - w);
  const y = Math.min(Math.max(0, cy - h / 2), imgH - h);
  return { x, y, w, h };
}

async function cropToJpeg(bitmap: ImageBitmap, r: Rect, outW: number, outH: number) {
  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new Error("Foto gagal diproses. Coba lagi.");
  return blob;
}

const lightCheck = (b: number): Check & { reason?: string } =>
  b < 60
    ? { label: "Pencahayaan cukup", ok: false, reason: "Foto terlalu gelap. Cari cahaya siang dari jendela." }
    : b > 235
      ? { label: "Pencahayaan cukup", ok: false, reason: "Foto terlalu terang. Hindari cahaya langsung dan flash." }
      : { label: "Pencahayaan cukup", ok: true };

// ---------------------------------------------------------------------------------

export async function prepareFace(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch (e) {
    return { ok: false, reason: (e as Error).message, checks: [] };
  }
  const canvas = detectionCanvas(bitmap);
  const toSrc = bitmap.width / canvas.width;

  let detector: FaceDetector;
  try {
    detector = await faceDetector();
  } catch {
    return fallback(bitmap, "face");
  }
  const faces = detector.detect(canvas).detections;
  const checks: Check[] = [];

  if (faces.length !== 1) {
    checks.push({ label: "Satu wajah terlihat jelas", ok: false });
    return {
      ok: false,
      checks,
      reason:
        faces.length === 0
          ? "Wajah tidak terdeteksi. Gunakan foto close-up wajah yang menghadap kamera dan tidak tertutup."
          : "Terdeteksi lebih dari satu wajah. Gunakan foto dirimu sendiri saja.",
    };
  }
  checks.push({ label: "Satu wajah terlihat jelas", ok: true });

  const box = faces[0].boundingBox!;
  const face: Rect = { x: box.originX, y: box.originY, w: box.width, h: box.height };
  const sizeOk = face.w / canvas.width >= 0.12 && face.h * toSrc >= 140;
  checks.push({ label: "Wajah cukup dekat", ok: sizeOk });
  if (!sizeOk) return { ok: false, checks, reason: "Wajah terlalu kecil di foto. Dekatkan kamera ke wajah." };

  const light = lightCheck(brightness(canvas, face));
  checks.push({ label: light.label, ok: light.ok });
  if (!light.ok) return { ok: false, checks, reason: light.reason! };

  // Square around face, hair and neck: colour analysis needs hair and skin together.
  const side = Math.max(face.w, face.h) * 2.3;
  const focus: Rect = { x: face.x + face.w / 2 - side / 2, y: face.y + face.h * 0.45 - side / 2, w: side, h: side };
  const crop = fitRect(focus, 1, canvas.width, canvas.height);
  const srcCrop = { x: crop.x * toSrc, y: crop.y * toSrc, w: crop.w * toSrc, h: crop.h * toSrc };
  const blob = await cropToJpeg(bitmap, srcCrop, 768, 768);

  const points = (faces[0].keypoints ?? []).map((k) => ({
    x: (k.x * canvas.width - crop.x) / crop.w,
    y: (k.y * canvas.height - crop.y) / crop.h,
  }));
  checks.push({ label: "Dipotong otomatis ke area wajah", ok: true });
  return { ok: true, blob, url: URL.createObjectURL(blob), checks, points, verified: true };
}

// Landmark indices (MediaPipe pose): nose, shoulders, hips, ankles, heels, foot tips.
const NOSE = 0;
const REQUIRED = [11, 12, 23, 24, 27, 28];
const FEET = [27, 28, 29, 30, 31, 32];

export async function prepareBody(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch (e) {
    return { ok: false, reason: (e as Error).message, checks: [] };
  }
  const canvas = detectionCanvas(bitmap);
  const toSrc = bitmap.width / canvas.width;

  let pose: PoseLandmarker;
  try {
    pose = await poseLandmarker();
  } catch {
    return fallback(bitmap, "body");
  }
  const people = pose.detect(canvas).landmarks;
  const checks: Check[] = [];

  if (people.length !== 1) {
    checks.push({ label: "Satu orang terlihat", ok: false });
    return {
      ok: false,
      checks,
      reason:
        people.length === 0
          ? "Badan tidak terdeteksi. Berdiri tegak menghadap kamera."
          : "Terdeteksi lebih dari satu orang. Gunakan foto dirimu sendiri saja.",
    };
  }
  checks.push({ label: "Satu orang terlihat", ok: true });

  const lm = people[0];
  const inFrame = (i: number) =>
    (lm[i].visibility ?? 1) > 0.5 && lm[i].x > 0.01 && lm[i].x < 0.99 && lm[i].y > 0.01 && lm[i].y < 0.995;
  const fullBody = inFrame(NOSE) && REQUIRED.every(inFrame);
  checks.push({ label: "Terlihat dari kepala sampai kaki", ok: fullBody });
  if (!fullBody) {
    return { ok: false, checks, reason: "Seluruh badan belum terlihat. Pastikan kepala sampai kaki masuk ke foto." };
  }

  const ys = [NOSE, ...REQUIRED, ...FEET].filter((i) => lm[i]).map((i) => lm[i].y * canvas.height);
  const xs = lm.map((p) => p.x * canvas.width);
  const top = lm[NOSE].y * canvas.height;
  const bottom = Math.max(...ys);
  const bodyH = bottom - top;
  const bigEnough = bodyH / canvas.height >= 0.45 && bodyH * toSrc >= 500;
  checks.push({ label: "Badan cukup besar di foto", ok: bigEnough });
  if (!bigEnough) return { ok: false, checks, reason: "Kamu terlihat terlalu jauh. Mundurkan kamera sedikit saja." };

  // Head top sits about a fifth of the body height above the nose.
  const focus: Rect = {
    x: Math.min(...xs) - bodyH * 0.12,
    y: top - bodyH * 0.2,
    w: Math.max(...xs) - Math.min(...xs) + bodyH * 0.24,
    h: bodyH * 1.26,
  };
  const light = lightCheck(brightness(canvas, focus));
  checks.push({ label: light.label, ok: light.ok });
  if (!light.ok) return { ok: false, checks, reason: light.reason! };

  const crop = fitRect(focus, 3 / 4, canvas.width, canvas.height);
  const srcCrop = { x: crop.x * toSrc, y: crop.y * toSrc, w: crop.w * toSrc, h: crop.h * toSrc };
  const blob = await cropToJpeg(bitmap, srcCrop, 960, 1280);
  const points = lm.map((p) => ({
    x: (p.x * canvas.width - crop.x) / crop.w,
    y: (p.y * canvas.height - crop.y) / crop.h,
  }));
  checks.push({ label: "Dipotong otomatis ke seluruh badan", ok: true });
  return { ok: true, blob, url: URL.createObjectURL(blob), checks, points, verified: true };
}

// If the models cannot load (offline, blocked CDN), accept the photo resized but not
// cropped, and say so. The server-side analysis still checks the photo.
async function fallback(bitmap: ImageBitmap, kind: "face" | "body"): Promise<Prepared> {
  if (Math.min(bitmap.width, bitmap.height) < 512) {
    return { ok: false, reason: "Resolusi foto terlalu kecil. Minimal 512 px di sisi terpendek.", checks: [] };
  }
  const scale = Math.min(1, (kind === "face" ? 1024 : 1280) / Math.max(bitmap.width, bitmap.height));
  const blob = await cropToJpeg(
    bitmap,
    { x: 0, y: 0, w: bitmap.width, h: bitmap.height },
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  return {
    ok: true,
    blob,
    url: URL.createObjectURL(blob),
    checks: [{ label: "Pemeriksaan otomatis tidak tersedia, foto dikirim apa adanya", ok: true }],
    points: [],
    verified: false,
  };
}
