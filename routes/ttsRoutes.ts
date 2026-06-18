// routes/ttsRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { ttsController } from "../controllers/ttsController.js";

const ttsRouter = express.Router();

ttsRouter.post("/generate", protect, ttsController.generateTts);

export default ttsRouter;
