// controllers/communityController.ts
import type { Request, Response } from "express";
import { communityService } from "../services/communityService.js";

export const communityController = {
  async createPost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const files = (req.files as Express.Multer.File[]) || [];

      const result = await communityService.createPost(userId, req.body, files);

      res.status(201).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in createPost:",
        error.message || "createPost failed",
      );

      // Friendly error messages
      const message =
        error.message || "Failed to create post. Please try again.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  },

  async getAllTags(req: Request, res: Response) {
    try {
      const result = await communityService.getAllTags();
      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getAllTags:",
        error.message || "getAllTags failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tags. Please try again.",
      });
    }
  },

  async getPostById(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const currentUserId = req.user?.userId; // undefined if guest

      const result = await communityService.getPostById(
        postId as string,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getPostById:",
        error.message || "getPostById failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to retrieve post. Please try again.",
      });
    }
  },
};
