// controllers/tipController.ts

import type { Request, Response, NextFunction } from "express";
import { tipService } from "../services/tipService.js";

export const tipController = {
  async getToday(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const result = await tipService.getTodayTips(userId);

      if (!result.success) {
        return res.status(result.tips?.length === 0 ? 404 : 400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
};
