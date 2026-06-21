// schema\cropSchema.ts
import { z } from "zod";

export const addPreferredCropSchema = z.object({
  cropType: z.enum([
    "MAIZE",
    "TOMATO",
    "CASSAVA",
    "PLANTAIN",
    "PEPPER",
    "COCOA",
  ]),
  customName: z.string().max(100).optional(),
  plantingDate: z.string().datetime().optional(), // ISO string from frontend
  expectedHarvestDate: z.string().datetime().optional(),
  farmSize: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const updatePreferredCropSchema = z.object({
  customName: z.string().max(100).optional(),
  plantingDate: z.string().datetime().optional(),
  expectedHarvestDate: z.string().datetime().optional(),
  farmSize: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
  status: z
    .enum(["HEALTHY", "MONITORING", "AT_RISK", "HARVEST_READY"])
    .optional(),
});

export type AddPreferredCropInput = z.infer<typeof addPreferredCropSchema>;
export type UpdatePreferredCropInput = z.infer<
  typeof updatePreferredCropSchema
>;

export const getCropHistorySchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .optional()
    .default("10"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minConfidence: z
    .string()
    .transform(Number)
    .pipe(z.number().min(0).max(1))
    .optional(),
});

export type GetCropHistoryInput = z.infer<typeof getCropHistorySchema>;
