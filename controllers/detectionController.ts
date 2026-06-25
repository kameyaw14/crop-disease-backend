// controllers/detectionController.ts
//@ts-nocheck
import type { Request, Response, NextFunction } from "express";
import { detectDisease } from "../services/detectionService.js";
import { detectSchema, type DetectInput } from "../schema/detectionSchema.js";
import type { DetectionResponse } from "../types/index.js";

export const detectionController = {
  async detect(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Image file is required",
        });
      }

      const validatedBody: DetectInput = detectSchema.parse(req.body);

      // Check for demo mode from query parameter
      const isDemoMode = req.query.demo === "true" || req.query.demo === true;

      if (isDemoMode) {
        console.log("🧪 Demo mode enabled for this request");
      }

      const isFreeScan = validatedBody.cropType === "FREE";

      if (isFreeScan) {
        console.log("🔍 Free scan mode — Gemini will auto-identify the crop");
      }

      const result: DetectionResponse = await detectDisease(
        req.file,
        validatedBody,
        userId,
        isDemoMode,
        isFreeScan,
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      next(error);
    }
  },
};
