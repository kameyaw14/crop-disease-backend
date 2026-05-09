// schemas/detectionSchema.ts
import { z } from "zod";

// NEW ADDITION: Zod validation for detection endpoint
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
