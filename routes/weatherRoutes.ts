// routes/weatherRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { weatherController } from "../controllers/weatherController.js";

const weatherRouter = express.Router();

weatherRouter.get("/forecast", protect, weatherController.getForecast);
weatherRouter.post("/enrich", protect, weatherController.enrichForecast);

export default weatherRouter;
