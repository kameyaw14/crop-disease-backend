// services/detectionService.ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../utils/env.js";
import { prisma } from "../config/connectDb.js";
import {
  detectionResultSchema,
  resultSchema,
  type DetectInput,
} from "../schema/detectionSchema.js";
import { v2 as cloudinary } from "cloudinary";
import type { DetectionResponse, DetectionResult } from "../types/index.js";
import { getDetectionSystemPrompt } from "../utils/prompts.js";

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export async function detectDisease(
  file: Express.Multer.File,
  validatedBody: DetectInput,
  userId: string,
): Promise<DetectionResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { language: true },
  });

  const userLanguage = user?.language || "en";

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

  console.log(
    `Calling Gemini with language: ${userLanguage} for crop: ${validatedBody.cropType}`,
  );

  const imagePart = {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    },
  };

  const systemPrompt = getDetectionSystemPrompt(userLanguage);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", // Current stable model in 2026
    contents: [systemPrompt, userPrompt, imagePart],
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
