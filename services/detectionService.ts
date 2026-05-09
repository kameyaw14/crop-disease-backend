// services/detectionService.ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../utils/env.js";
import { prisma } from "../config/connectDb.js"; // NEW ADDITION: Prisma import
import {
  detectionResultSchema,
  resultSchema,
  type DetectInput,
} from "../schema/detectionSchema.js";
import { v2 as cloudinary } from "cloudinary";
import type { DetectionResponse, DetectionResult } from "../types/index.js";

const SYSTEM_PROMPT = `You are a senior Ghanaian agronomist with 20+ years of field experience.

CRITICAL INSTRUCTIONS (follow strictly):
1. First, determine if the image clearly shows the SELECTED crop type.
2. If the image is NOT a plant, or shows wrong crop, or is unclear (hand, soil only, animal, building, etc.), set isCorrectCrop = false.
3. Only if isCorrectCrop = true, provide full disease diagnosis.
4. Be extremely strict with crop matching. Ghanaian farmers depend on accuracy.
5. Return ONLY valid JSON. No extra text.`;

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export async function detectDisease(
  file: Express.Multer.File,
  validatedBody: DetectInput,
  userId: string,
): Promise<DetectionResponse> {
 
  const cloudinaryUpload = await new Promise<any>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "crop-diagnose/detections",
          resource_type: "image",
          transformation: [{ width: 800, crop: "limit" }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      )
      .end(file.buffer);
  });

  const imageUrl = cloudinaryUpload.secure_url;

  const userPrompt = `Selected Crop: ${validatedBody.cropType.toUpperCase()}
Analyze this image carefully and follow the system instructions.`;

  console.log("Calling Gemini with crop verification...");

  const imagePart = {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    },
  };

  // UPDATED: Using new structured schema + better config
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", // Current stable model in 2026
    contents: [SYSTEM_PROMPT, userPrompt, imagePart],
    config: {
      responseMimeType: "application/json",
      responseSchema: detectionResultSchema,
      temperature: 0.0, //  Lower temp for consistency
    },
  });

  const text = response.text;
  const parsed = JSON.parse(text);

  console.log("Result:", parsed);

  const validatedResult = resultSchema.parse(parsed);

  if (!validatedResult.isCorrectCrop) {
    return {
      success: false,
      errorType: "CROP_MISMATCH",
      message: `The uploaded image does not match the selected crop (${validatedBody.cropType}).`,
      detectedCrop: validatedResult.detectedCrop,
      reason: validatedResult.cropVerificationReason,
    };
  }

  const detection = await prisma.$transaction(async (tx) => {
    return await tx.detection.create({
      data: {
        imageUrl,
        cropType: validatedBody.cropType,
        rawResponse: parsed,
        diseaseName: validatedResult.diseaseName,
        confidence: validatedResult.confidence,
        possibleDiseases: validatedResult.possibleDiseases,
        symptoms: validatedResult.symptoms,
        causes: validatedResult.causes,
        organicTreatments: validatedResult.organicTreatments,
        chemicalOptions: validatedResult.chemicalOptions,
        prevention: validatedResult.prevention,
        localNotes: validatedResult.localNotes,
        userId,
      },
    });
  });

  return {
    success: true,
    id: detection.id,
    imageUrl,
    ...validatedResult,
    timestamp: new Date().toISOString(),
  };
}
