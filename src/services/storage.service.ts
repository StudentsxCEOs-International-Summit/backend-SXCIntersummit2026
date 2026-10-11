import multer from "multer";
import { google } from "googleapis";
import { Readable } from "stream";
import { env } from "../configs/env";
import crypto from "crypto";
import path from "path";

// Initialize Google Drive API Client
let driveClient: any = null;

function getDriveClient() {
  if (driveClient) return driveClient;

  try {
    let auth;

    if (env.GOOGLE_DRIVE_CLIENT_EMAIL && env.GOOGLE_DRIVE_PRIVATE_KEY) {
      auth = new google.auth.JWT({
        email: env.GOOGLE_DRIVE_CLIENT_EMAIL,
        key: env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
      });
    } else if (env.GOOGLE_DRIVE_CREDENTIALS_BASE64) {
      const credentialsJson = Buffer.from(env.GOOGLE_DRIVE_CREDENTIALS_BASE64, "base64").toString("utf-8");
      const credentials = JSON.parse(credentialsJson);

      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
    } else {
      console.warn(
        "[STORAGE] Neither GOOGLE_DRIVE_CLIENT_EMAIL/GOOGLE_DRIVE_PRIVATE_KEY nor GOOGLE_DRIVE_CREDENTIALS_BASE64 is set. Google Drive uploads will fail or be mocked."
      );
      return null;
    }

    driveClient = google.drive({ version: "v3", auth });
    return driveClient;
  } catch (error: any) {
    console.error("[STORAGE] Failed to initialize Google Drive client:", error.message);
    return null;
  }
}

/**
 * Uploads a file buffer to Google Drive and returns the web view link.
 */
export async function uploadFileToDrive(file: Express.Multer.File): Promise<string> {
  const drive = getDriveClient();
  
  if (!drive) {
    console.warn("[STORAGE MOCK] Simulating upload to Google Drive for:", file.originalname);
    return `https://mock-drive.google.com/file/${Date.now()}`;
  }

  const folderId = env.GOOGLE_DRIVE_FOLDER_ID;
  const ext = path.extname(file.originalname);
  const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  const fileMetadata = {
    name: uniqueName,
    parents: folderId ? [folderId] : undefined,
  };

  const media = {
    mimeType: file.mimetype,
    body: Readable.from(file.buffer),
  };

  try {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    });

    // Make the file publicly accessible
    if (response.data.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
    }

    return response.data.webViewLink || "";
  } catch (error: any) {
    console.error("[STORAGE] Upload to Google Drive failed:", error.message);
    throw new Error("Failed to upload file to Google Drive");
  }
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

// We use memoryStorage so we can stream the buffer directly to Google Drive
const memoryStorage = multer.memoryStorage();

/** Upload payment proof (images only, max 5 MB) */
export const uploadPayment = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload requirement proof – twibbon / IG story screenshot (images only, max 5 MB) */
export const uploadRequirement = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Upload slide deck (PDF / PPTX, max 20 MB) */
export const uploadSlides = multer({
  storage: memoryStorage,
  fileFilter: docFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});
