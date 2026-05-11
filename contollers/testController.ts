// controllers/testTtsController.ts
import type { Request, Response } from "express";
import { SimpleTtsService } from "../services/intronTtsService.js";

const TEST_TWI_TEXT = `Wo nua, w'afono no yɛ den paa. Fa nsuo na hohoro ahono no yie yie. Sɛ wo di yie a, wo nnɔbae no bɛsɔ na wo nyini yie.`;

export const testTtsController = {
  async testTwiTTS(req: Request, res: Response) {
    try {
      const audioUrl = await SimpleTtsService.generateTwiSpeech(TEST_TWI_TEXT);

      res.status(200).json({
        success: true,
        message: "Twi TTS test successful (GTTS)",
        audioUrl,
        text: TEST_TWI_TEXT.trim(),
        language: "tw",
        note: "Open the audioUrl in your browser or React Native to test playback",
      });
    } catch (error: any) {
      console.error("TTS Test Failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate Twi audio",
        error: error.message,
      });
    }
  },
};