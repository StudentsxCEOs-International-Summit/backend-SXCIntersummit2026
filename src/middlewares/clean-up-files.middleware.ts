import { Request, Response, NextFunction } from "express";
import fs from "fs";

export function cleanupUploadFiles(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.files) {
    const files = Object.values(req.files).flat() as Express.Multer.File[];

    files.forEach((file) => {
      if (file.path) fs.unlink(file.path, () => {});
    });
  }

  next(err);
}
