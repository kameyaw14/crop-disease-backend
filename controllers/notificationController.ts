// controllers/notificationController.ts
//@ts-nocheck
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/connectDb.js";
import { processDailyAlerts } from "../utils/cron.js";

export const notificationController = {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { limit = 20, unreadOnly = "false" } = req.query;

      const notifications = await prisma.notification.findMany({
        where: {
          userId,
          ...(unreadOnly === "true" ? { isRead: false } : {}),
        },
        orderBy: { sentAt: "desc" },
        take: Number(limit),
      });

      res.json({
        success: true,
        data: notifications,
        count: notifications.length,
      });
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      await prisma.notification.update({
        where: { id, userId },
        data: { isRead: true },
      });

      res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
      next(error);
    }
  },

  // NEW: Manual trigger for testing
  async triggerAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      // Run the full daily alert process
      await processDailyAlerts();
      console.log("🧪 Manual alert trigger activated");

      res.json({
        success: true,
        message: "Manual alert trigger executed. Check server logs.",
      });
    } catch (error) {
      next(error);
    }
  },
};
