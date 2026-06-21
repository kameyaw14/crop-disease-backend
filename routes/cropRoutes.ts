// routes/cropRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { cropController } from "../controllers/cropController.js";

const cropRouter = express.Router();

cropRouter.get("/my-crops", protect, cropController.getMyCrops);

cropRouter.post("/my-crops", protect, cropController.addMyCrop);

cropRouter.patch("/my-crops/:cropType", protect, cropController.updateMyCrop);

cropRouter.delete("/my-crops/:cropType", protect, cropController.deleteMyCrop);

export default cropRouter;
