// controllers/authController.ts

import type { Request, Response } from "express";
import { authService } from "../services/authService.js";

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        message: "Account created successfully",
        ...result,
      });
    } catch (error: any) {
      console.error("❗Error in register:", error.message || "register failed");
      res.status(400).json({
        success: false,
        message: error.message || "Registration failed",
      });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      console.log({ email: email, pswrd: password });
      const result = await authService.login(email, password);
      res.status(200).json({
        success: true,
        message: "Login successful",
        ...result,
      });
    } catch (error: any) {
      console.error("❗Error in login:", error.message || "Login failed");
      res.status(401).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  },

  async getMe(req: Request, res: Response) {
    try {
      const user = await authService.getMe(req.user!.userId);
      res.json({ success: true, user });
    } catch (error: any) {
      console.error("❗Error in getMe:", error.message || "getMe failed");
      res.status(500).json({ success: false, message: "Failed to fetch user" });
    }
  },

  async updateLanguage(req: Request, res: Response) {
    try {
      // @ts-ignore - user attached by protect middleware
      const result = await authService.updateLanguage(
        req.user!.userId,
        req.body,
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update language",
      });
    }
  },
};
