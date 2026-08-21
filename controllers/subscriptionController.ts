// controllers\subscriptionController.ts

import type { Request, Response, NextFunction } from "express";
import { subscriptionService } from "../services/subscriptionService.js";
import { subscribeSchema } from "../schema/subscriptionSchema.js";

export const subscriptionController = {
  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const result = await subscriptionService.getStatus(userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async subscribe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const validated = subscribeSchema.parse(req.body);
      const result = await subscriptionService.activateDemoSubscription(
        userId,
        validated,
      );
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Subscribe error:", error.message);
      return res.status(400).json({
        success: false,
        message: error.message || "Unable to activate subscription.",
      });
    }
  },
};
