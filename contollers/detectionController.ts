// controllers/detectionController.ts
import type { Request, Response, NextFunction } from "express";
import { detectDisease } from "../services/detectionService.js";
import { detectSchema, type DetectInput } from "../schema/detectionSchema.js";

// NEW ADDITION: Controller - Thin layer following same pattern as authController
export const detectionController = {
  async detect(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-ignore - user attached by protect middleware (same pattern as your auth)
      const userId = req.user!.userId;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Image file is required",
        });
      }

      // Validate request body
      const validatedBody: DetectInput = detectSchema.parse(req.body);

      // Call service (all heavy logic here)
      const result = await detectDisease(req.file, validatedBody, userId);

      res.status(200).json({
        success: true,
        message: "Disease detected successfully",
        data: result,
      });
    } catch (error: any) {
      next(error); // Forward to your global error handler
    }
  },
};
