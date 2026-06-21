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
