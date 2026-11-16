import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

const uploadDir = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err: any) {
  console.warn("Notice: uploads directory check:", err.message);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images (jpeg, png, webp, gif, svg) and PDF files are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * Returns full link URL for an uploaded file
 */
export function getFileUrl(
  req: Request,
  filePathOrName?: string | null,
): string | null {
  if (!filePathOrName) return null;
  if (
    filePathOrName.startsWith("http://") ||
    filePathOrName.startsWith("https://")
  ) {
    return filePathOrName;
  }
  const cleanName = filePathOrName.replace(/^\/?uploads\/?/, "");
  return `${req.protocol}://${req.get("host")}/uploads/${cleanName}`;
}

/**
 * Deletes an uploaded file from disk
 */
export function deleteUploadedFile(filePathOrName?: string | null): void {
  if (!filePathOrName) return;

  let relativePath = filePathOrName;
  if (
    relativePath.startsWith("http://") ||
    relativePath.startsWith("https://")
  ) {
    try {
      const parsed = new URL(relativePath);
      relativePath = parsed.pathname;
    } catch {
      return;
    }
  }

  const cleanName = relativePath.replace(/^\/?uploads\/?/, "");
  const fullPath = path.join(process.cwd(), "uploads", cleanName);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn("Failed to delete file:", fullPath, e);
    }
  }
}
