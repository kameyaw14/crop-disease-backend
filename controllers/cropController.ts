// controllers/cropController.ts
import type { Request, Response } from "express";
import { cropService } from "../services/cropService.js";

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
};
