// routes/authRoutes.ts
// NEW FILE
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authController } from "../controllers/authController.js";

const authRouter = express.Router();

authRouter.post("/register", authController.register);
authRouter.post("/login", authController.login);
authRouter.get("/me", protect, authController.getMe);

export default authRouter;
