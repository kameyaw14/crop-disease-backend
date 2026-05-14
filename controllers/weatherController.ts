// controllers/weatherController.ts
import type { Request, Response, NextFunction } from "express";
import { weatherService } from "../services/weatherService.js";
import type { WeatherForecastResponse } from "../types/index.js";

export const weatherController = {
  async getForecast(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-ignore - user attached by protect middleware
      const userId = req.user!.userId;

      const lat = req.query.lat
        ? parseFloat(req.query.lat as string)
        : undefined;
      const lon = req.query.lon
        ? parseFloat(req.query.lon as string)
        : undefined;

      const result: WeatherForecastResponse = await weatherService.getForecast(
        userId,
        lat,
        lon,
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
