//config/checkEnv.ts
//@ts-nocheck

import { env } from "../utils/env.js";

// List every required env var here – if it's missing or empty, we crash hard and loud bro
const requiredVars = [
  "SYSTEM_NAME",
  "DATABASE_URL",
  "PORT",
  "MODE",
  "CLIENT_URL",
  // "GOOGLE_CLIENT_ID",
  // "GOOGLE_CLIENT_SECRET",
  "SERVER_URL",
  "JWT_SECRET",
  // "JWT_REFRESH_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  // "ADMIN_SECRET_KEY",
  // "ADMIN_EMAIL",
  // "ADMIN_PASSWORD",
  // "ADMIN_NAME",
  // "ADMIN_URL",
  // "ADMIN_ID",
  // "JWT_ADMIN_SECRET",
  // "RESEND_API_KEY",
  // "EMAIL_FROM",
  // "MAGIC_LINK_EXPIRY_MINUTES",
  "MAX_IMAGE_SIZE_MB"
];

export function checkRequiredEnv() {
  const missing = [];

  for (const key of requiredVars) {
    // Bro check: if undefined, null, or just whitespace → missing
    if (!env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      "🚨🚨 MISSING ENVIRONMENT VARIABLES, SERVER CANNOT START 🚨🚨",
    );
    console.error("❌Missing:", missing.join(", "));
    console.error("❌Fix your .env file and restart, bro!");
    process.exit(1); // Kill the process – no half-running server bullshit
  }

  console.log("✅ All required env variables are present, let's ride bro!");
}
