//utils/env.ts
import dotenv from "dotenv";

dotenv.config();

export const env = {
  // Basic
  SYSTEM_NAME: process.env.SYSTEM_NAME?.trim(),
  PORT: Number(process.env.PORT) || 3100,
  MODE: process.env.MODE?.trim() || "development",

  // URLs
  CLIENT_URL: process.env.CLIENT_URL?.trim(),
  SERVER_URL: process.env.SERVER_URL?.trim(),
  //   ADMIN_URL: process.env.ADMIN_URL?.trim(),
  // PYTHON_SERVICE_URL: process.env.PYTHON_SERVICE_URL?.trim(),

  //APIs
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim(),

  // Database
  DATABASE_URL: process.env.DATABASE_URL?.trim(),

  // Cloudinary

  // JWT secrets
  JWT_SECRET: process.env.JWT_SECRET?.trim(),

  //image config
  MAX_IMAGE_SIZE_MB: process.env.MAX_IMAGE_SIZE_MB?.trim(),

  // Admin setup
  //   ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY?.trim(),
  //   ADMIN_EMAIL: process.env.ADMIN_EMAIL?.trim(),
  //   ADMIN_PASSWORD: process.env.ADMIN_PASSWORD?.trim(),
  //   ADMIN_NAME: process.env.ADMIN_NAME?.trim(),
  //   ADMIN_ID: process.env.ADMIN_ID?.trim(),

  // Email (Resend + SMTP fallback)
  //   RESEND_API_KEY: process.env.RESEND_API_KEY?.trim(),
  //   EMAIL_FROM: process.env.EMAIL_FROM?.trim(),
  //   MAGIC_LINK_EXPIRY_MINUTES: process.env.MAGIC_LINK_EXPIRY_MINUTES?.trim(),

  // Google OAuth + YouTube API

  // Redis (Render)

  //google
  //   GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  //   GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

  //jwt
  //   JWT_SECRET: process.env.JWT_SECRET,
  //   JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  //   JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET,

  //   //cloudinary
  //   CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  //   CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  //   CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  //   //paystack
  //   PAYSTACK_TEST_SECRET_KEY: process.env.PAYSTACK_TEST_SECRET_KEY,
  //   PAYSTACK_TEST_PUBLIC_KEY: process.env.PAYSTACK_TEST_PUBLIC_KEY,
} as const;
