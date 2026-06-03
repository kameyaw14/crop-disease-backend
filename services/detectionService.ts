////@ts-nocheck
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
import crypto from "crypto";

//Helper to create SHA-256 hash
function generateImageHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Retry helper with exponential backoff
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export async function detectDisease(
  file: Express.Multer.File,
  validatedBody: DetectInput,
  userId: string,
  isDemoMode: boolean = false,
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

  const imageHash = generateImageHash(file.buffer);

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

  if (!isDemoMode) {
    const cached = await prisma.cachedDiagnosis.findUnique({
      where: { imageHash },
    });

    if (cached && cached.expiresAt > new Date()) {
      console.log("✅ Cache hit for image hash:", imageHash);
      // Save detection record linked to cache
      const detection = await prisma.detection.create({
        data: {
          imageUrl,
          cropType: validatedBody.cropType,
          rawResponse: cached.result,
          diseaseName: cached.result.diseaseName,
          confidence: cached.result.confidence,
          possibleDiseases: cached.result.possibleDiseases,
          symptoms: cached.result.symptoms,
          causes: cached.result.causes,
          organicTreatments: cached.result.organicTreatments,
          chemicalOptions: cached.result.chemicalOptions,
          prevention: cached.result.prevention,
          localNotes: cached.result.localNotes,
          userId,
          cachedDiagnosisId: cached.id,
          aiProvider: "gemini-cached",
        },
      });

      return {
        success: true,
        id: detection.id,
        imageUrl,
        ...cached.result,
        timestamp: new Date().toISOString(),
        fromCache: true,
      };
    }
  }

  if (isDemoMode) {
    console.log("🧪 Demo mode active - returning friendly message");
    return {
      success: false,
      errorType: "DEMO_MODE",
      message:
        "Demo mode is active. Please pre-populate cache with common crops for presentation.",
      suggestion: "Use real mode or seed cache for reliable demo.",
    };
  }

  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(
        `🔄 Gemini Attempt ${attempt}/3 for ${validatedBody.cropType}`,
      );

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [systemPrompt, userPrompt, imagePart],
        config: {
          responseMimeType: "application/json",
          responseSchema: detectionResultSchema,
          temperature: 0.0,
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

      const cachedDiagnosis = await prisma.cachedDiagnosis.create({
        data: {
          imageHash,
          cropType: validatedBody.cropType,
          language: userLanguage,
          result: validatedResult,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          userId,
        },
      });

      const detection = await prisma.detection.create({
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
          cachedDiagnosisId: cachedDiagnosis.id,
          aiProvider: "gemini",
        },
      });

      console.log(`✅ Diagnosis successful on attempt ${attempt}`);
      return {
        success: true,
        id: detection.id,
        imageUrl,
        ...validatedResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      const isOverloaded =
        error.message?.toLowerCase().includes("overloaded") ||
        error.message?.includes("429") ||
        error.status === 429 ||
        error.message?.includes("5");

      if (!isOverloaded || attempt === 3) {
        break;
      }

      const delay = Math.pow(1.8, attempt) * 1000; // 1.8s -> ~3.2s
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  console.log("All attempts failed. Checking for similar cached result...");

  const similarCache = await prisma.cachedDiagnosis.findFirst({
    where: { cropType: validatedBody.cropType, language: userLanguage },
    orderBy: { createdAt: "desc" },
  });

  if (similarCache) {
    console.log("Showing similar cached diagnosis as fallback");
    return {
      success: true,
      message:
        "Our AI is currently busy. Showing a similar previous diagnosis for this crop.",
      imageUrl,
      ...similarCache.result,
      fromCache: true,
      isFallback: true,
    };
  }

  return {
    success: false,
    errorType: "AI_UNAVAILABLE",
    message:
      "Our AI service is currently experiencing high traffic. Please try again in a few moments.",
    suggestion:
      "Common diseases for this crop are available in the community section.",
  };
}
