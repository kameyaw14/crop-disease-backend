// routes/notificationRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { notificationController } from "../controllers/notificationController.js";

const notificationRouter = express.Router();

notificationRouter.get("/", protect, notificationController.getNotifications);
notificationRouter.patch("/:id/read", protect, notificationController.markAsRead);
notificationRouter.post("/trigger", protect, notificationController.triggerAlerts); // Dev only

export default notificationRouter;
