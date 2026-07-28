// routes/communityRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadPostImages } from "../middleware/upload.js";
import { communityController } from "../controllers/communityController.js";

const communityRouter = express.Router();

communityRouter.get("/tags", communityController.getAllTags);

communityRouter.post(
  "/posts",
  protect,
  uploadPostImages,
  communityController.createPost,
);

export default communityRouter;
