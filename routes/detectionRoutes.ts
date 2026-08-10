// routes/detectionRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { detectionController } from "../controllers/detectionController.js";

const router = express.Router();

router.post("/detect", protect, uploadSingleImage, detectionController.detect);

router.get("/detections/my", protect, detectionController.getMyDetections);

router.get("/detection/:id", protect, detectionController.getDetectionById);

export default router;
