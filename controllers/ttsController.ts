//controllers/ttsController.ts
//@ts-nocheck

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
        // UPDATED: the old "/tts/v1/tts" path is now deprecated on Khaya AI's
        // portal. "/tts/v1/synthesize" is the current, non-deprecated operation.
        "https://translation-api.ghananlp.org/tts/v1/synthesize",
        {
          text: text.trim(),
          language: "tw",
          // speaker_id is optional per the docs (Required: false). Leaving it out
          // lets the API pick its default speaker. We can pin a specific
          // speaker_id later once you check the "Get list of all available
          // speakers" GET endpoint and decide which voice fits the app best.
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": env.GHANANLP_API_KEY,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
          },
          responseType: "arraybuffer",
        },
      );

      // Guard: confirm we actually got audio back, not an HTML/JSON error page.
      // This keeps future failures readable in the logs instead of a raw buffer dump.
      const contentType = response.headers["content-type"] || "";

      if (!contentType.includes("audio")) {
        const bodyAsText = Buffer.from(response.data).toString("utf-8");

        console.error(
          "TTS Proxy Error: expected audio, got content-type:",
          contentType,
          "body preview:",
          bodyAsText.slice(0, 300),
        );

        return res.status(502).json({
          success: false,
          message:
            "Speech service is temporarily unavailable. Please try again later.",
        });
      }

      // Return as base64 for easy frontend consumption
      const audioBase64 = Buffer.from(response.data).toString("base64");

      return res.status(200).json({
        success: true,
        audioBase64,
        format: "wav",
        message: "TTS generated successfully",
      });
    } catch (error: any) {
      // error.response.data is a Buffer here too (responseType: arraybuffer),
      // so decode it before logging or the real error message stays hidden.
      let errorDetail = error.message;
      if (error?.response?.data) {
        try {
          errorDetail = Buffer.from(error.response.data)
            .toString("utf-8")
            .slice(0, 300);
        } catch {
          errorDetail = error.message;
        }
      }

      console.error("TTS Proxy Error:", errorDetail);

      return res.status(500).json({
        success: false,
        message: "Failed to generate speech. Please try again.",
      });
    }
  },
};
