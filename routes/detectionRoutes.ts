import express from "express";
import multer from "multer";
import { z } from "zod";
import { detectDisease } from "../services/detectionService.js";

const router = express.Router();

// NEW ADDITION: Multer config for secure image upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpg, png, webp) are allowed"));
    }
  },
});

// Validation schema for cropType
const detectSchema = z.object({
  cropType: z
    .enum([
      "maize",
      "cassava",
      "yam",
      "cocoa",
      "plantain",
      "tomato",
      "pepper",
      "okra",
      "rice",
      "groundnut",
      "other",
    ])
    .default("other"),
});

// NEW ADDITION: Main detection endpoint
router.post(
  "/detect",
  upload.single("image"),
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Image file is required",
        });
      }

      const body = detectSchema.parse(req.body);

      // Call service
      const result = await detectDisease(req.file, body.cropType);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      next(error);
    }
  },
);

export default router;
