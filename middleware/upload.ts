// middleware/upload.ts
import multer from "multer";
import type { Request } from "express";
import { env } from "../utils/env.js";

// NEW ADDITION: Reusable and secure multer configuration
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

// NEW ADDITION: Single image upload middleware (easy to extend later)
export const uploadSingleImage = upload.single("image");

export default upload;
