// schema/communitySchema.ts
// @ts-nocheck
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

export const getMyPostsSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(50, "Limit can't be over than 50"),
    )
    .optional()
    .default("10"),
});

export type GetMyPostsInput = z.infer<typeof getMyPostsSchema>;

export const getPostsSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(20, "Limit can't be more than 20"),
    )
    .optional()
    .default("10"),
  tag: z.string().min(1).optional(),
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
  q: z.string().min(1).optional(),
});

export type GetPostsInput = z.infer<typeof getPostsSchema>;

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(1000, "Comment cannot exceed 1000 characters"),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const createReplySchema = createCommentSchema;

export type CreateReplyInput = z.infer<typeof createReplySchema>;

export const getCommentsSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(20, "Limit can't be more than 20"),
    )
    .optional()
    .default("10"),
});

export type GetCommentsInput = z.infer<typeof getCommentsSchema>;

export const getPostLikesSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(50, "Limit can't be more than 50"),
    )
    .optional()
    .default("20"),
});

export type GetPostLikesInput = z.infer<typeof getPostLikesSchema>;

export const getSavedPostsSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(20, "Limit can't be more than 20"),
    )
    .optional()
    .default("10"),
});

export type GetSavedPostsInput = z.infer<typeof getSavedPostsSchema>;

export const paginationSchema = z.object({
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1, "Page can't be less than 1"))
    .optional()
    .default("1"),
  limit: z
    .string()
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit can't be less than 1")
        .max(50, "Limit can't be more than 50"),
    )
    .optional()
    .default("20"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

//  Same shape is reused for the three list endpoints
export const getFollowersSchema = paginationSchema;
export type GetFollowersInput = PaginationInput;

export const getFollowingSchema = paginationSchema;
export type GetFollowingInput = PaginationInput;

export const getMyFollowingTagsSchema = paginationSchema;
export type GetMyFollowingTagsInput = PaginationInput;
