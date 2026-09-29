import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// ─────────────────────────────────────────────
// STORAGE CONFIG
// ─────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

/** Ensure the upload directory tree exists */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─────────────────────────────────────────────
// MULTER DISK STORAGE
// ─────────────────────────────────────────────

function createDiskStorage(subfolder: string) {
  return multer.diskStorage({
    destination(_req, _file, cb) {
      const dest = path.join(UPLOAD_DIR, subfolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      cb(null, uniqueName);
    },
  });
}

// ─────────────────────────────────────────────
// FILE FILTER
// ─────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
  ...ALLOWED_IMAGE_TYPES,
];

function imageFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only image files are allowed (jpg, png, webp, gif). Received: ${file.mimetype}`));
  }
}

function docFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_DOC_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Only PDF, PPT/PPTX, and image files are allowed. Received: ${file.mimetype}`,
      ),
    );
  }
}

// ─────────────────────────────────────────────
// PRE-CONFIGURED MULTER INSTANCES
// ─────────────────────────────────────────────

/** Upload payment proof (images only, max 5 MB) */
export const uploadPayment = multer({
  storage: createDiskStorage("payment"),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload requirement proof – twibbon / IG story screenshot (images only, max 5 MB) */
export const uploadRequirement = multer({
  storage: createDiskStorage("requirement"),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload slide deck (PDF / PPTX, max 20 MB) */
export const uploadSlides = multer({
  storage: createDiskStorage("slides"),
  fileFilter: docFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────
// UTILITY: build a public URL from a saved file
// ─────────────────────────────────────────────

export function fileToPublicUrl(file: Express.Multer.File): string {
  // Relative path from project root, normalised to forward slashes
  const relative = path
    .relative(process.cwd(), file.path)
    .replace(/\\/g, "/");
  return `/${relative}`;
}

/** Delete a file from disk (fire-and-forget) */
export function deleteFile(filePath: string) {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath.replace(/^\//, ""));

  fs.unlink(absolute, (err) => {
    if (err) console.warn(`[STORAGE] Could not delete ${absolute}:`, err.message);
  });
}
