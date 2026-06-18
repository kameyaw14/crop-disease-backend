//controllers/ttsController.ts
import type { Request, Response, NextFunction } from "express";
import { env } from "../utils/env.js";
import axios from "axios";

export const ttsController = {
  async generateTts(req: Request, res: Response, next: NextFunction) {
    try {
      const { text, language = "tw" } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Text is required for TTS",
        });
      }

      if (language !== "tw") {
        return res.status(400).json({
          success: false,
          message: "Only Twi (tw) supported currently",
        });
      }

      const response = await axios.post(
        "https://translation-api.ghananlp.org/tts/v1/tts",
        {
          text: text.trim(),
          language: "tw",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": env.GHANANLP_API_KEY,
          },
          responseType: "arraybuffer",
        },
      );

      // Return as base64 for easy frontend consumption
      const audioBase64 = Buffer.from(response.data).toString("base64");

      return res.status(200).json({
        success: true,
        audioBase64,
        format: "wav",
        message: "TTS generated successfully",
      });
    } catch (error: any) {
      console.error("TTS Proxy Error:", error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to generate speech. Please try again.",
      });
    }
  },
};
