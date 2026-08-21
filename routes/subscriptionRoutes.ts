// routes\subscriptionRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { subscriptionController } from "../controllers/subscriptionController.js";

const subscriptionRouter = express.Router();

subscriptionRouter.get("/status", protect, subscriptionController.getStatus);

subscriptionRouter.post("/", protect, subscriptionController.subscribe);

export default subscriptionRouter;
