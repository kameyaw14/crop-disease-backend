// src/server.ts

import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import detectionRouter from "./routes/detectionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/authRoutes.js";
import { env } from "./utils/env.js";
import { checkRequiredEnv } from "./config/checkEnv.js";

checkRequiredEnv();

dotenv.config();

const app = express();
const PORT = env.PORT || 4000;
const allowedOrigins = [
  env.CLIENT_URL,
  // env.ADMIN_URL,
  "http://localhost:3000",
  "http://localhost:3002",
].filter(Boolean) as string[];

const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    console.log("🔍 CORS checking origin:", origin || "no origin");

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("🚫 CORS blocked origin:", origin);
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ], // Add any custom headers you use
  preflightContinue: false,
  credentials: false, // not using cookies
  optionsSuccessStatus: 204,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api", detectionRouter);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: `${env.SYSTEM_NAME} server running!!`,
    environment: env.MODE || "development",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint does not exist.",
  });
});

// Error handling (always last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Node backend running on http://localhost:${PORT}`);
  console.log(`📸 Test detection: POST /api/detect with image + cropType`);
});
