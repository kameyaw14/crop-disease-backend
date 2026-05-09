import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../utils/env.js";

// TypeScript interface (explained for you)
interface DetectionResult {
  diseaseName: string;
  confidence: number; // 0.0 - 1.0 (higher = more sure)
  possibleDiseases: Array<{ name: string; confidence: number }>;
  symptoms: string;
  causes: string;
  organicTreatments: string;
  chemicalOptions: string;
  prevention: string;
  localNotes: string; // Ghana/Twi friendly advice
  timestamp: string;
}

const detectionSchema = {
  type: "object",
  properties: {
    diseaseName: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    possibleDiseases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["name", "confidence"],
      },
    },
    symptoms: { type: "string" },
    causes: { type: "string" },
    organicTreatments: { type: "string" },
    chemicalOptions: { type: "string" },
    prevention: { type: "string" },
    localNotes: { type: "string" },
  },
  required: [
    "diseaseName",
    "confidence",
    "possibleDiseases",
    "symptoms",
    "causes",
    "organicTreatments",
    "chemicalOptions",
    "prevention",
    "localNotes",
  ],
  additionalProperties: false,
};

// Strong system prompt for better accuracy
const SYSTEM_PROMPT = `You are a senior Ghanaian agronomist with 20+ years of field experience.
Analyze the uploaded plant image very carefully. Think step by step.
Focus especially on plant diseases common in Ghana.
Be highly confident and consistent in your diagnosis.
Return ONLY valid JSON object. Do not add any extra text.`;

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export async function detectDisease(
  file: Express.Multer.File,
  cropType: string,
): Promise<DetectionResult> {
  // NEW ADDITION: Prepare image for Gemini
  const imagePart = {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    },
  };

  const userPrompt = `Crop Type: ${cropType.toUpperCase()}
Analyze this image and provide detailed diagnosis. Include local recommendations suitable for Ghanaian farmers.`;

  // Call Gemini

  console.log("Calling gemini...");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", // Fast + excellent vision model in 2026
    contents: [SYSTEM_PROMPT, userPrompt, imagePart],
    config: {
      responseMimeType: "application/json",
      responseSchema: detectionSchema,
      temperature: 0.1, // Low temperature = more consistent results
    },
  });

  const text = response.text;
  const parsed = JSON.parse(text);

  console.log("Result:", parsed);

  // Runtime validation with Zod
  const resultSchema = z.object({
    diseaseName: z.string().min(1),
    confidence: z.number().min(0).max(1),
    possibleDiseases: z
      .array(
        z.object({
          name: z.string(),
          confidence: z.number().min(0).max(1),
        }),
      )
      .default([]),
    symptoms: z.string(),
    causes: z.string(),
    organicTreatments: z.string(),
    chemicalOptions: z.string(),
    prevention: z.string(),
    localNotes: z.string(),
  });

  const validated = resultSchema.parse(parsed);

  return {
    ...validated,
    timestamp: new Date().toISOString(),
  };
}
