import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Readable } from "stream";
import { google } from "googleapis";
import { env } from "../configs/env";
import { createChildLogger } from "../configs/logger";

const storageLogger = createChildLogger("STORAGE");

export interface UploadGdriveResult {
  fileId: string;
  webViewLink: string;
  directDownloadLink: string;
}

/** 1 is the main Drive account; 2 is the optional backup used when 1 is full or its token is dead. */
export type DriveAccount = 1 | 2;

const driveInstances: Partial<Record<DriveAccount, any>> = {};

const refreshTokenOf = (account: DriveAccount) =>
  account === 1 ? env.GOOGLE_DRIVE_REFRESH_TOKEN : env.GOOGLE_DRIVE_REFRESH_TOKEN_2;

/** Accounts that have a refresh token, main account first. */
export function configuredDriveAccounts(): DriveAccount[] {
  return ([1, 2] as DriveAccount[]).filter((account) => Boolean(refreshTokenOf(account)));
}

/** Folder IDs for one account (each account has its own Drive, so its own folders). */
export function driveFolders(account: DriveAccount = 1) {
  const pick = (main: string | undefined, second: string | undefined) =>
    account === 1 ? main : second;

  const base =
    pick(env.GOOGLE_DRIVE_FOLDER_IBCC_ID, env.GOOGLE_DRIVE_FOLDER_IBCC_ID_2) ||
    pick(env.GOOGLE_DRIVE_FOLDER_ID, env.GOOGLE_DRIVE_FOLDER_ID_2);

  return {
    base,
    registration:
      pick(env.GOOGLE_DRIVE_FOLDER_REGISTRATION_ID, env.GOOGLE_DRIVE_FOLDER_REGISTRATION_ID_2) || base,
    payment: pick(env.GOOGLE_DRIVE_FOLDER_PAYMENT_ID, env.GOOGLE_DRIVE_FOLDER_PAYMENT_ID_2) || base,
    preliminary:
      pick(env.GOOGLE_DRIVE_FOLDER_PRELIMINARY_ID, env.GOOGLE_DRIVE_FOLDER_PRELIMINARY_ID_2) || base,
    semifinal:
      pick(env.GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID, env.GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID_2) ||
      base,
  };
}

export function getDriveClient(account: DriveAccount = 1) {
  const existing = driveInstances[account];
  if (existing) return existing;

  const refreshToken = refreshTokenOf(account);
  if (refreshToken) {
    // Both accounts authorize through the same OAuth client; only the refresh token differs.
    const clientId = env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      env.GOOGLE_DRIVE_REDIRECT_URI ||
      `${env.APP_URL}/api/admin/drive/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    driveInstances[account] = google.drive({ version: "v3", auth: oauth2Client });
    return driveInstances[account];
  }

  throw new Error(
    `Google Drive OAuth credentials are not configured for account ${account}. Please set ${
      account === 1 ? "GOOGLE_DRIVE_REFRESH_TOKEN" : "GOOGLE_DRIVE_REFRESH_TOKEN_2"
    } via /api/admin/drive/setup.`,
  );
}

const folderIdCache = new Map<string, string>();

/**
 * Mendapatkan ID subfolder yang sudah ada atau membuatnya jika belum ada
 */
export async function getOrCreateFolder(
  folderName: string,
  parentFolderId: string,
  account: DriveAccount = 1,
): Promise<string> {
  const cacheKey = `${account}:${parentFolderId}:${folderName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)!;
  }

  const drive = getDriveClient(account);
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = `name = '${escapedName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const response = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
    supportsAllDrives: true,
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
  account: DriveAccount = 1,
): Promise<string> {
  const parentId = parentFolderId || driveFolders(account).registration;

  if (!parentId) {
    throw new Error(`Registration parent folder ID is not configured for Drive account ${account}.`);
  }

  const folderName = `[${teamCode}] ${teamName}`;
  return getOrCreateFolder(folderName, parentId, account);
}

/**
 * Mengunggah buffer memori langsung ke target Google Drive folder via stream
 */
export async function uploadBufferToDrive(
  fileBuffer: Buffer | NodeJS.ReadableStream,
  fileName: string,
  mimeType: string,
  folderId: string,
  account: DriveAccount = 1,
): Promise<UploadGdriveResult> {
  const drive = getDriveClient(account);

  // Remove prior file with identical name to prevent duplicate storage
  try {
    const escapedName = fileName.replace(/'/g, "\\'");
    const existing = await drive.files.list({
      q: `name = '${escapedName}' and '${folderId}' in parents and trashed = false`,
      fields: "files(id)",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (existing.data.files && existing.data.files.length > 0) {
      for (const f of existing.data.files) {
        if (f.id) {
          await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {});
        }
      }
    }
  } catch {
  }

  const mediaStream = Buffer.isBuffer(fileBuffer) ? Readable.from(fileBuffer) : fileBuffer;

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
    supportsAllDrives: true,
  });

  const fileId = response.data.id!;

  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
      supportsAllDrives: true,
    });
  } catch (err: any) {
    storageLogger.warn({ err, fileId }, "Could not set reader permission on Drive file");
  }

  return {
    fileId,
    webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    directDownloadLink: `https://lh3.googleusercontent.com/d/${fileId}`,
  };
}

export const uploadStreamToGoogleDrive = uploadBufferToDrive;

/**
 * Uploads a file buffer to Google Drive and returns the web view link (compatibility helper)
 */
export async function uploadFileToDrive(file: Express.Multer.File): Promise<string> {
  const folderId =
    env.GOOGLE_DRIVE_FOLDER_ID ||
    env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
    env.GOOGLE_DRIVE_FOLDER_UPLOADS_ROOT_ID ||
    "";

  if (!folderId) {
    throw new Error("Google Drive Folder ID is not configured.");
  }

  const ext = path.extname(file.originalname);
  const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  const result = await uploadBufferToDrive(
    file.buffer ?? fs.createReadStream(file.path),
    uniqueName,
    file.mimetype,
    folderId,
  );

  return result.webViewLink;
}

/**
 * Incoming files are spooled to disk (not RAM) and uploaded to Drive in the background,
 * so a burst of submissions near a deadline neither exhausts memory nor waits on Drive.
 */
export const PENDING_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "pending");
export const PENDING_PREFIX = "pending:";

fs.mkdirSync(PENDING_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PENDING_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

/** Value for `SubmissionFile.filePath` while the file waits for its Drive upload. */
export function pendingFilePath(file: Express.Multer.File): string {
  return `${PENDING_PREFIX}${path.basename(file.path)}`;
}

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

function imageFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only image files are allowed (jpg, png, webp, gif). Received: ${file.mimetype}`));
  }
}

function docFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_DOC_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only PDF, PPT/PPTX, and image files are allowed. Received: ${file.mimetype}`));
  }
}

/** Upload payment proof (images only, max 5 MB) */
export const uploadPayment = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload requirement proof – twibbon / IG story screenshot (images only, max 5 MB) */
export const uploadRequirement = multer({
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
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("file");

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
      if (err) storageLogger.warn({ err, filePath: absolute }, "Could not delete local file");
    });
  }
}
