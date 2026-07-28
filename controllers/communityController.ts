// controllers/communityController.ts
import type { Request, Response } from "express";
import { communityService } from "../services/communityService.js";

export const communityController = {
  async createPost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const files = (req.files as Express.Multer.File[]) || [];

      const result = await communityService.createPost(
        userId,
        req.body,
        files,
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error("❗Error in createPost:", error.message || "createPost failed");

      // Friendly error messages
      const message =
        error.message || "Failed to create post. Please try again.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  },
};