// services/detectionService.ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../utils/env.js";
import { prisma } from "../config/connectDb.js"; // NEW ADDITION: Prisma import
import type { DetectInput } from "../schema/detectionSchema.js";
import { v2 as cloudinary } from "cloudinary";

// NEW ADDITION: TypeScript interface with explanation
interface DetectionResult {
  id: string;
  imageUrl: string;
  diseaseName: string;
  confidence: number;
  possibleDiseases: Array<{ name: string; confidence: number }>;
  symptoms: string;
  causes: string;
  organicTreatments: string;
  chemicalOptions: string;
  prevention: string;
  localNotes: string;
  timestamp: string;
}

// NO CHANGES - Kept your original schema
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

// NO CHANGES - Kept your strong system prompt
const SYSTEM_PROMPT = `You are a senior Ghanaian agronomist with 20+ years of field experience.
Analyze the uploaded plant image very carefully. Think step by step.
Focus especially on plant diseases common in Ghana.
Be highly confident and consistent in your diagnosis.
Return ONLY valid JSON object. Do not add any extra text.`;

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

// NEW ADDITION: Zod runtime validation schema
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

export async function detectDisease(
  file: Express.Multer.File,
  validatedBody: DetectInput,
  userId: string,
): Promise<DetectionResult> {
  // NEW ADDITION: Upload to Cloudinary with organized folder
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

  const userPrompt = `Crop Type: ${validatedBody.cropType.toUpperCase()}
Analyze this image and provide detailed diagnosis. Include local recommendations suitable for Ghanaian farmers.`;

  console.log("Calling gemini...");

  const imagePart = {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    },
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [SYSTEM_PROMPT, userPrompt, imagePart],
    config: {
      responseMimeType: "application/json",
      responseSchema: detectionSchema,
      temperature: 0.1,
    },
  });

  const text = response.text;
  const parsed = JSON.parse(text);

  console.log("Result:", parsed);

  // UPDATED: Proper validation
  const validatedResult = resultSchema.parse(parsed);

  // NEW ADDITION: Save detection record using Prisma transaction
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
    id: detection.id,
    imageUrl,
    ...validatedResult,
    timestamp: new Date().toISOString(),
  };
}
