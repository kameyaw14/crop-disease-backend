// middleware/upload.ts
import multer from "multer";
import type { Request } from "express";
import { env } from "../utils/env.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: Number(env.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024, // 5MB default
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpg, png, webp, jpeg) are allowed"));
    }
  },
});

export const uploadSingleImage = upload.single("image");
export const uploadPostImages = upload.array("images", 3);

export default upload;
