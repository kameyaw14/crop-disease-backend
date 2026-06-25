// services/detectionService.ts
//@ts-nocheck
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
import {
  getDetectionSystemPrompt,
  getFreeScanSystemPrompt,
} from "../utils/prompts.js";
import crypto from "crypto";
import {
  computeHammingDistance,
  computePerceptualHash,
  PHASH_SIMILARITY_THRESHOLD,
} from "../utils/pHash.js";
import { cropService } from "./cropService.js";

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

//  Helper to safely create Detection record (prevents FK violations)
async function createSafeDetection(data: any) {
  // TypeScript: 'any' used temporarily for flexibility during defensive creation
  try {
    // Defensive: verify user exists before linking
    if (data.userId) {
      const existingUser = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true },
      });

      if (!existingUser) {
        console.warn(
          `⚠️ User ${data.userId} not found - creating detection without user link`,
        );
        delete data.userId; // safe removal
      }
    }

    return await prisma.detection.create({ data });
  } catch (err: any) {
    console.error("❌ Detection creation failed:", err.message);
    throw err;
  }
}

const SUPPORTED_CROP_ENUMS = [
  "MAIZE",
  "CASSAVA",
  "COCOA",
  "PLANTAIN",
  "TOMATO",
  "PEPPER",
  "RICE",
  "YAM",
  "GROUNDNUT",
  "ONION",
] as const;

type SupportedCropEnum = (typeof SUPPORTED_CROP_ENUMS)[number];

function mapDetectedCropToEnum(
  detectedCropEnum: string,
): SupportedCropEnum | null {
  const upper = detectedCropEnum?.toUpperCase?.() ?? "";

  if ((SUPPORTED_CROP_ENUMS as readonly string[]).includes(upper)) {
    return upper as SupportedCropEnum;
  }
  return null; // "UNKNOWN" or any unsupported crop
}

export async function detectDisease(
  file: Express.Multer.File,
  validatedBody: DetectInput,
  userId: string,
  isDemoMode: boolean = false,
  isFreeScan: boolean = false,
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

  let imagePerceptualHash: string | null = null;

  try {
    imagePerceptualHash = await computePerceptualHash(file.buffer);
    console.log("🔍 pHash computed:", imagePerceptualHash);
  } catch (pHashError) {
    console.warn(
      "⚠️ pHash computation failed, continuing without it:",
      pHashError,
    );
  }

  const userPrompt = isFreeScan
    ? `The user does not know what crop this is. Please identify the crop and diagnose any disease present. Analyze this image carefully and follow the system instructions.`
    : `Selected Crop: ${validatedBody.cropType.toUpperCase()}\nAnalyze this image carefully and follow the system instructions.`;

  console.log(
    `Calling Gemini with language: ${userLanguage} for crop: ${validatedBody.cropType}`,
  );

  const imagePart = {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    },
  };

  const systemPrompt = isFreeScan
    ? getFreeScanSystemPrompt(userLanguage)
    : getDetectionSystemPrompt(userLanguage);

  // ─── LAYER 1: SHA-256 Exact Hash Cache (runs for both normal and FREE scans)
  if (!isDemoMode) {
    const cached = await prisma.cachedDiagnosis.findUnique({
      where: {
        imageHash_language: {
          imageHash,
          language: userLanguage,
        },
      },
    });

    if (cached && cached.expiresAt > new Date()) {
      console.log("✅ Cache hit for image hash:", imageHash);
      //  Use safe detection creation to prevent userId FK violation
      const detection = await createSafeDetection({
        imageUrl,
        cropType: isFreeScan
          ? (cached.cropType ?? "FREE")
          : validatedBody.cropType,
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
        userId, // may be removed inside helper if invalid
        cachedDiagnosisId: cached.id,
        aiProvider: "gemini-cached",
      });

      let suggestAddToMyCrops;

      if (isFreeScan) {
        //  FREE scan path for cache hit suggestion logic
        const enumCandidate = mapDetectedCropToEnum(
          cached.result.detectedCropEnum ?? "",
        );
        if (enumCandidate) {
          const isAlreadyInCrops = await cropService.isCropInPreferred(
            userId,
            enumCandidate,
          );
          suggestAddToMyCrops = {
            suggested: !isAlreadyInCrops,
            cropType: enumCandidate,
            message: !isAlreadyInCrops
              ? `Would you like to add ${enumCandidate} to My Crops for better tracking, history, and personalized insights?`
              : `This crop is already in your My Crops. Great job tracking your farm!`,
          };
        }
        // If enumCandidate is null (unsupported crop), suggestAddToMyCrops stays
        // undefined and is simply omitted from the response — no suggestion shown.
      } else {
        console.log(`🔃 checking if already in crops`);

        const normalizedCropType = validatedBody.cropType.toUpperCase();
        const isAlreadyInCrops = await cropService.isCropInPreferred(
          userId,
          normalizedCropType,
        );

        console.log(`✅ checked if already in crops`);

        suggestAddToMyCrops = {
          suggested: !isAlreadyInCrops,
          cropType: validatedBody.cropType,
          message: !isAlreadyInCrops
            ? `Would you like to add ${validatedBody.cropType} to My Crops for better tracking, history, and personalized insights?`
            : `This crop is already in your My Crops. Great job tracking your farm!`,
        };
      }

      return {
        success: true,
        id: detection.id,
        imageUrl,
        ...cached.result,
        timestamp: new Date().toISOString(),
        suggestAddToMyCrops,
        fromCache: true,
      };
    }
  }

  // ─── LAYER 2: pHash Similarity Cache
  // FREE scans skip Layer 2 entirely.
  // Reason: Layer 2 filters candidates by cropType, but for FREE scans we don't
  // know the crop yet — scanning all crop types would be noisy and expensive.
  if (!isDemoMode && !isFreeScan && imagePerceptualHash) {
    console.log("🔎 Layer 1 missed. Checking Layer 2 (pHash similarity)...");

    const candidates = await prisma.cachedDiagnosis.findMany({
      where: {
        cropType: validatedBody.cropType,
        language: userLanguage,
        expiresAt: { gt: new Date() },
        imagePerceptualHash: { not: null },
      },
      select: {
        id: true,
        imagePerceptualHash: true,
        result: true,
        diseaseName: true,
        confidence: true,
      },
    });

    console.log(
      `🔎 Found ${candidates.length} pHash candidates for ${validatedBody.cropType}/${userLanguage}`,
    );

    let bestMatch: {
      id: string;
      result: any;
      diseaseName: string | null;
      distance: number;
    } | null = null;

    for (const candidate of candidates) {
      if (!candidate.imagePerceptualHash) continue;

      const distance = computeHammingDistance(
        imagePerceptualHash,
        candidate.imagePerceptualHash,
      );

      console.log(
        `   Candidate ${candidate.id} (${candidate.diseaseName}): Hamming distance = ${distance}`,
      );

      if (
        distance <= PHASH_SIMILARITY_THRESHOLD &&
        (bestMatch === null || distance < bestMatch.distance)
      ) {
        bestMatch = {
          id: candidate.id,
          result: candidate.result,
          diseaseName: candidate.diseaseName,
          distance,
        };
      }
    }

    if (bestMatch) {
      console.log(
        `✅ Layer 2 cache hit (pHash match, Hamming distance: ${bestMatch.distance}):`,
        bestMatch.id,
      );

      //  Use safe detection creation
      const detection = await createSafeDetection({
        imageUrl,
        cropType: validatedBody.cropType,
        rawResponse: bestMatch.result,
        diseaseName: bestMatch.result.diseaseName,
        confidence: bestMatch.result.confidence,
        possibleDiseases: bestMatch.result.possibleDiseases,
        symptoms: bestMatch.result.symptoms,
        causes: bestMatch.result.causes,
        organicTreatments: bestMatch.result.organicTreatments,
        chemicalOptions: bestMatch.result.chemicalOptions,
        prevention: bestMatch.result.prevention,
        localNotes: bestMatch.result.localNotes,
        userId,
        cachedDiagnosisId: bestMatch.id,
        aiProvider: "gemini-phash-cached",
      });

      return {
        success: true,
        id: detection.id,
        imageUrl,
        ...bestMatch.result,
        timestamp: new Date().toISOString(),
        fromCache: true,
        pHashDistance: bestMatch.distance,
      };
    }

    console.log("🔎 Layer 2 missed. Proceeding to Gemini...");
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

  // ─── LAYER 3: Gemini AI Call (with retry)
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
        if (isFreeScan) {
          //  FREE scan rejection path — no recognizable plant found
          return {
            success: false,
            errorType: "NO_PLANT_DETECTED",
            message:
              "No recognizable plant or crop was detected in the image. Please take a clear photo of a plant.",
            detectedCrop: validatedResult.detectedCrop,
            reason: validatedResult.cropVerificationReason,
          };
        } else {
          //  normal scan crop mismatch path
          return {
            success: false,
            errorType: "CROP_MISMATCH",
            message: `The uploaded image does not match the selected crop (${validatedBody.cropType}).`,
            detectedCrop: validatedResult.detectedCrop,
            reason: validatedResult.cropVerificationReason,
          };
        }
      }

      const resolvedCropType = isFreeScan
        ? (mapDetectedCropToEnum(validatedResult.detectedCropEnum) ?? "FREE")
        : validatedBody.cropType;

      // ─── LAYER 3a: Disease Label Deduplication
      // TypeScript: We declare cachedDiagnosisId as string | undefined because
      // cache creation can fail gracefully without breaking the main diagnosis flow.
      const existingDiseaseCache = await prisma.cachedDiagnosis.findFirst({
        where: {
          diseaseName: validatedResult.diseaseName,
          cropType: resolvedCropType,
          language: userLanguage,
          expiresAt: { gt: new Date() },
        },
        orderBy: { confidence: "desc" },
      });

      let cachedDiagnosisId: string | undefined;

      if (existingDiseaseCache) {
        console.log(
          `♻️ Reusing existing cache entry for disease: ${validatedResult.diseaseName}`,
        );

        cachedDiagnosisId = existingDiseaseCache.id;

        if (!existingDiseaseCache.imagePerceptualHash && imagePerceptualHash) {
          await prisma.cachedDiagnosis.update({
            where: { id: existingDiseaseCache.id },
            data: { imagePerceptualHash },
          });
          console.log(
            `🔄 Backfilled pHash on existing cache entry: ${existingDiseaseCache.id}`,
          );
        }
      } else {
        console.log(
          `💾 Attempting to create new cache entry for disease: ${validatedResult.diseaseName} with userId: ${userId}`,
        );

        try {
          const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });

          if (!existingUser) {
            console.warn(
              `⚠️ User ${userId} not found - creating cache without user link`,
            );
          }

          const cachedDiagnosis = await prisma.cachedDiagnosis.upsert({
            where: {
              imageHash_language: {
                imageHash,
                language: userLanguage,
              },
            },

            update: {
              result: validatedResult,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              imagePerceptualHash: imagePerceptualHash ?? undefined,
              diseaseName: validatedResult.diseaseName,
              confidence: validatedResult.confidence,
            },
            create: {
              imageHash,
              cropType: resolvedCropType,
              language: userLanguage,
              result: validatedResult,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              userId: existingUser ? userId : undefined,
              imagePerceptualHash: imagePerceptualHash ?? undefined,
              diseaseName: validatedResult.diseaseName,
              confidence: validatedResult.confidence,
            },
          });

          cachedDiagnosisId = cachedDiagnosis.id;
          console.log(
            `💾 Cache entry upserted successfully: ${cachedDiagnosisId}`,
          );
        } catch (cacheError: any) {
          console.error("❌ Failed to create cache entry:", cacheError.message);
          cachedDiagnosisId = undefined;
        }
      }

      //  Use safe detection creation
      const detection = await createSafeDetection({
        imageUrl,
        cropType: resolvedCropType,
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
        cachedDiagnosisId: cachedDiagnosisId ?? undefined,
        aiProvider: "gemini",
      });

      console.log(`✅ Diagnosis successful on attempt ${attempt}`);

      let suggestAddToMyCrops;

      if (isFreeScan) {
        // FREE scan live Gemini path suggestion logic
        const enumCandidate = mapDetectedCropToEnum(
          validatedResult.detectedCropEnum,
        );
        if (enumCandidate) {
          const isAlreadyInCrops = await cropService.isCropInPreferred(
            userId,
            enumCandidate,
          );
          suggestAddToMyCrops = {
            suggested: !isAlreadyInCrops,
            cropType: enumCandidate,
            message: !isAlreadyInCrops
              ? `Would you like to add ${enumCandidate} to My Crops for better tracking, history, and personalized insights?`
              : `This crop is already in your My Crops. Great job tracking your farm!`,
          };
        }
        // null enumCandidate = unsupported crop, suggestAddToMyCrops stays undefined
      } else {
        console.log(`🔃 checking if already in crops`);

        const normalizedCropType = validatedBody.cropType.toUpperCase();
        const isAlreadyInCrops = await cropService.isCropInPreferred(
          userId,
          normalizedCropType,
        );

        console.log(`✅ checked if already in crops`);

        suggestAddToMyCrops = {
          suggested: !isAlreadyInCrops,
          cropType: validatedBody.cropType,
          message: !isAlreadyInCrops
            ? `Would you like to add ${validatedBody.cropType} to My Crops for better tracking, history, and personalized insights?`
            : `This crop is already in your My Crops. Great job tracking your farm!`,
        };
      }

      return {
        success: true,
        id: detection.id,
        imageUrl,
        ...validatedResult,
        timestamp: new Date().toISOString(),
        suggestAddToMyCrops,
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

      const delay = Math.pow(1.8, attempt) * 1000;
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  console.log("All attempts failed. Checking for similar cached result...");

  const similarCache = await prisma.cachedDiagnosis.findFirst({
    where: {
      //  For FREE scans the fallback searches across ALL crop types
      // since we don't know the crop. For normal scans, filter by cropType as before.
      ...(isFreeScan ? {} : { cropType: validatedBody.cropType }),
      language: userLanguage,
    },
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
