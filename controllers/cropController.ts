// controllers/cropController.ts
import type { Request, Response } from "express";
import { cropService } from "../services/cropService.js";
import type {
  AddPreferredCropInput,
  GetCropHistoryInput,
  UpdatePreferredCropInput,
} from "../schema/cropSchema.js";

export const cropController = {
  async getMyCrops(req: Request, res: Response) {
    try {
      const result = await cropService.getMyCrops(req.user!.userId);

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch your crops",
      });
    }
  },

  async addMyCrop(req: Request, res: Response) {
    try {
      const result = await cropService.addPreferredCrop(
        req.user!.userId,
        req.body as AddPreferredCropInput,
      );
      res.status(result.success ? 201 : 400).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: "Invalid crop data provided.",
      });
    }
  },

  async updateMyCrop(req: Request, res: Response) {
    try {
      const { cropType } = req.params;
      const result = await cropService.updatePreferredCrop(
        req.user!.userId,
        cropType,
        req.body as UpdatePreferredCropInput,
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: "Failed to update crop details.",
      });
    }
  },

  async deleteMyCrop(req: Request, res: Response) {
    try {
      const { cropType } = req.params;
      const result = await cropService.deletePreferredCrop(
        req.user!.userId,
        cropType,
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: "Failed to remove crop.",
      });
    }
  },

  async getCropHistory(req: Request, res: Response) {
    try {
      const { cropType } = req.params;
      const result = await cropService.getCropHistory(
        req.user!.userId,
        cropType,
        req.query as unknown as GetCropHistoryInput,
      );
      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch crop history. Please try again later.",
      });
    }
  },
};
