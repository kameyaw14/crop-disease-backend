// routes/tipRoutes.ts

import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { tipController } from "../controllers/tipController.js";

const tipRouter = express.Router();

tipRouter.get("/today", protect, tipController.getToday);

export default tipRouter;
