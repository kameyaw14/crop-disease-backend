// routes/authRoutes.ts
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authController } from "../controllers/authController.js";

const authRouter = express.Router();

authRouter.post("/register", authController.register);
authRouter.post("/login", authController.login);
authRouter.get("/me", protect, authController.getMe);
authRouter.put("/language", protect, authController.updateLanguage);
authRouter.post("/forgot-password", authController.forgotPassword);
authRouter.post("/verify-reset-otp", authController.verifyResetOtp);
authRouter.post("/reset-password", authController.resetPassword);

export default authRouter;
