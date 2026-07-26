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

export const forgotPasswordSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
});

export const verifyResetOtpSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .partial() // TypeScript: .partial() turns every key into optional
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (fullName or location) must be provided",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
