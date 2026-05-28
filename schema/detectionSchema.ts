// schemas/detectionSchema.ts
import { z } from "zod";
 
export const detectSchema = z.object({
  cropType: z.enum([
    "maize",
    "cassava",
    "cocoa",
    "plantain",
    "tomato",
    "pepper",
  ]),
  notes: z.string().optional(), // Future user notes
});

export type DetectInput = z.infer<typeof detectSchema>;

export const detectionResultSchema = {
  type: "object",
  properties: {
    isCorrectCrop: {
      type: "boolean",
      description:
        "Whether the uploaded image matches the selected crop type. Must be false for non-plant images.",
    },
    detectedCrop: {
      type: "string",
      description:
        "The actual crop the model believes is in the image (if different). Return the selected crop only if confident match.",
    },
    cropVerificationReason: {
      type: "string",
      description:
        "Short explanation why the crop matches or does not match. Max 120 characters.",
    },
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
    "isCorrectCrop",
    "detectedCrop",
    "cropVerificationReason",
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

export const resultSchema = z.object({
  isCorrectCrop: z.boolean(),
  detectedCrop: z.string(),
  cropVerificationReason: z.string().max(150),
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

export type DetectionResult = z.infer<typeof resultSchema>;
