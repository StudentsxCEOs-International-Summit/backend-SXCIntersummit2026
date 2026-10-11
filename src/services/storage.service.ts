import multer from "multer";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { google } from "googleapis";
import { env } from "../configs/env";

export interface UploadGdriveResult {
  fileId: string;
  webViewLink: string;
  directDownloadLink: string;
}

let driveInstance: ReturnType<typeof google.drive> | null = null;

export function getDriveClient() {
  if (!driveInstance) {
    if (!env.GOOGLE_DRIVE_CLIENT_EMAIL || !env.GOOGLE_DRIVE_PRIVATE_KEY) {
      throw new Error("Google Drive credentials are not configured in environment variables.");
    }

    const auth = new google.auth.JWT({
      email: env.GOOGLE_DRIVE_CLIENT_EMAIL,
      key: env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    driveInstance = google.drive({ version: "v3", auth });
  }
  return driveInstance;
}

const folderIdCache = new Map<string, string>();

/**
 * Mendapatkan ID subfolder yang sudah ada atau membuatnya jika belum ada
 */
export async function getOrCreateFolder(
  folderName: string,
  parentFolderId: string,
): Promise<string> {
  const cacheKey = `${parentFolderId}:${folderName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)!;
  }

  const drive = getDriveClient();
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = `name = '${escapedName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const response = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (response.data.files && response.data.files.length > 0) {
    const existingId = response.data.files[0].id!;
    folderIdCache.set(cacheKey, existingId);
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  const createdId = created.data.id!;
  folderIdCache.set(cacheKey, createdId);
  return createdId;
}

/**
 * Mendapatkan atau membuat subfolder tim di Google Drive: `[${teamCode}] ${teamName}`
 */
export async function getOrCreateTeamFolder(
  teamCode: string,
  teamName: string,
  parentFolderId?: string,
): Promise<string> {
  const parentId =
    parentFolderId ||
    env.GOOGLE_DRIVE_FOLDER_REGISTRATION_ID ||
    env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
    env.GOOGLE_DRIVE_FOLDER_ID;

  if (!parentId) {
    throw new Error("Registration parent folder ID is not configured.");
  }

  const folderName = `[${teamCode}] ${teamName}`;
  return getOrCreateFolder(folderName, parentId);
}

/**
 * Mengunggah buffer memori langsung ke target Google Drive folder via stream
 */
export async function uploadBufferToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<UploadGdriveResult> {
  const drive = getDriveClient();
  const mediaStream = Readable.from(fileBuffer);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: mediaStream,
    },
    fields: "id, name, webViewLink, webContentLink",
  });

  const fileId = response.data.id!;

  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
  } catch (err: any) {
    console.warn(`[GDRIVE] Warning setting reader permission for ${fileId}:`, err.message);
  }

  return {
    fileId,
    webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    directDownloadLink: `https://lh3.googleusercontent.com/d/${fileId}`,
  };
}

export const uploadStreamToGoogleDrive = uploadBufferToDrive;

// ─────────────────────────────────────────────
// MULTER IN-MEMORY CONFIGURATION (ZERO LOCAL DISK)
// ─────────────────────────────────────────────

const storage = multer.memoryStorage();

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

/** Upload payment proof (images only, max 5 MB) */
export const uploadPayment = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload slide deck (PDF / PPTX, max 20 MB) */
export const uploadSlides = multer({
  storage,
  fileFilter: docFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

export const uploadRegistrationRequirements = multer({
  storage,
  fileFilter: docFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: "ktm_file", maxCount: 1 },
  { name: "follow_proof", maxCount: 1 },
  { name: "twibbon_proof", maxCount: 1 },
  { name: "poster_proof", maxCount: 1 },
  { name: "broadcast_proof", maxCount: 1 },
]);

export const uploadPreliminarySlideDeck = multer({
  storage,
  fileFilter: docFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
}).single("slideDeck");

/** Backward-compatible helper for legacy code */
export function fileToPublicUrl(file: Express.Multer.File): string {
  if (file.path) {
    const relative = path
      .relative(process.cwd(), file.path)
      .replace(/\\/g, "/");
    return `/${relative}`;
  }
  return "";
}

/** Delete a file from disk if path exists */
export function deleteFile(filePath: string) {
  if (!filePath) return;
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath.replace(/^\//, ""));

  if (fs.existsSync(absolute)) {
    fs.unlink(absolute, (err) => {
      if (err) console.warn(`[STORAGE] Could not delete ${absolute}:`, err.message);
    });
  }
}
