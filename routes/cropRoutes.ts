// routes/cropRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { cropController } from "../controllers/cropController.js";

const cropRouter = express.Router();

cropRouter.get("/my-crops", protect, cropController.getMyCrops);

export default cropRouter;