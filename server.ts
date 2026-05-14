// src/server.ts

import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import http from "http";
import detectionRouter from "./routes/detectionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/authRoutes.js";
import { env } from "./utils/env.js";
import { checkRequiredEnv } from "./config/checkEnv.js";
import connectCloudinary from "./config/connectCloudinary.js";
import weatherRouter from "./routes/weatherRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
// import { testTtsController } from "./contollers/testController.js";

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

const httpServer = http.createServer(app);

// app.post("/api/test-tts", testTtsController.testTwiTTS);
app.use("/api/auth", authRouter);
app.use("/api", detectionRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/notifications", notificationRouter);

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

const startServer = async () => {
  try {
    try {
      await connectCloudinary();
    } catch (error) {
      console.error("❌Error connecting to cloudinary", error);
    }
    httpServer.listen(PORT, () => {
      console.log(`Server running in ${env.MODE || "dev"} mode`);
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Allowed client URL: ${env.CLIENT_URL}`);
    });
  } catch (error) {
    console.error("❌Failed to start server", error);
    process.exit(1);
  }
};

startServer();

process.on("unhandledRejection", (err) => {
  console.error("❌Unhandled Rejection:", err);
  httpServer.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
  console.error("❌Uncaught Exception:", err);
  process.exit(1);
});
