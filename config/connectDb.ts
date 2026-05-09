//config/connectDb.ts

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../utils/env.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing in environment variables");
}

let prisma: PrismaClient;

if (process.env.MODE === "production") {
  // In production: no global caching needed (serverless-like environments)
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({
    adapter,
    log: ["error"],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  });
} else {
  // In dev: singleton to survive hot-reload
  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString });
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log: ["query", "info", "warn", "error"],
      transactionOptions: {
        maxWait: 5000,
        timeout: 15000,
      },
    });
  }

  prisma = globalForPrisma.prisma;
}

export { prisma };
