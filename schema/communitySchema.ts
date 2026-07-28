// schema/communitySchema.ts
import { z } from "zod";

// Official 16 regions of Ghana
export const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
] as const;

export const createPostSchema = z.object({
  content: z
    .string()
    .min(1, "Post content is required")
    .max(2000, "Post content cannot exceed 2000 characters"),

  // tagIds comes as a JSON string from form-data
  tagIds: z
    .string()
    .transform((val, ctx) => {
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "tagIds must be an array of tag IDs",
          });
          return z.NEVER;
        }
        return parsed;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tagIds must be a valid JSON array",
        });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(z.string().cuid("Invalid tag ID"))
        .min(1, "Please select at least one tag"),
    ),

  region: z
    .enum(GHANA_REGIONS, {
      errorMap: () => ({
        message: "Please select a valid Ghana region",
      }),
    })
    .optional(),

  cropType: z
    .enum([
      "MAIZE",
      "TOMATO",
      "CASSAVA",
      "PLANTAIN",
      "PEPPER",
      "COCOA",
      "RICE",
      "YAM",
      "GROUNDNUT",
      "ONION",
    ])
    .optional(),

  detectionId: z.string().cuid("Invalid detection ID").optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
