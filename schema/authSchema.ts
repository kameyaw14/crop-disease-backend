// schemas/authSchema.ts
//@ts-nocheck
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: z.string().min(10, "Valid phone number is required"),
  role: z.enum(["FARMER", "BEGINNER", "GARDENER", "STUDENT", "OTHER"]),
  preferredCrops: z.array(z.string()).min(1, "Select at least one crop"),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
    })
    .optional(),
});

export const languageSchema = z.object({
  language: z.enum(["en", "tw"], {
    errorMap: () => ({
      message: "Language must be either 'en' (English) or 'tw' (Twi)",
    }),
  }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const onboardDataSchema = z.object({
  fullName: z.string().min(2),
  phoneNumber: z.string().min(10),
  role: z.enum(["FARMER", "BEGINNER", "GARDENER", "STUDENT", "OTHER"]),
  preferredCrops: z.array(z.string()).min(1),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
  }),
});
