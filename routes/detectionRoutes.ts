// routes/detectionRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { detectionController } from "../contollers/detectionController.js";

const router = express.Router();

router.post("/detect", protect, uploadSingleImage, detectionController.detect);

export default router;
