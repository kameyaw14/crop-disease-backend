// config/connectCloudinary.ts
//@ts-nocheck

import { v2 as cloudinary } from "cloudinary";
import { env } from "../utils/env.js";

const connectCloudinary = async () => {
  try {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    // Test connection (optional but recommended in dev)
    const result = await cloudinary.api.ping();
    if (result.status === "ok") {
      console.log("Cloudinary connected successfully");
    }
  } catch (error: any) {
    console.error("❌Cloudinary connection failed:", error.message);
    // In production, you might want to throw or handle gracefully
  }
};

export default connectCloudinary;
