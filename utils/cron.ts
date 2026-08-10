// utils/cron.ts
import cron from "node-cron";
import { prisma } from "../config/connectDb.js";
import { alertService } from "../services/alertService.js";
import type { User } from "../generated/prisma/client.js";
import { pushService } from "../services/pushService.js";

export const startAlertCron = () => {
  console.log(
    "🕒 Alert Cron Job Initialized - Will run daily at 5:30 AM local time",
  );

  // Runs every day at 5:30 AM (we handle per-user local time inside the service)
  cron.schedule(
    "40 16 * * *", // Every 16:40
    // "30 5 * * *",
    // "*/30 * * * * *", // Every 30 seconds
    async () => {
      try {
        console.log("🚀 Running Daily Farmer Alert Job...");
        await processDailyAlerts();
      } catch (error) {
        console.error("❌ Cron Job Failed:", error);
      }
    },
    {
      timezone: "Africa/Accra", // Ghana default fallback
    },
  );
};

export async function processDailyAlerts() {
  const users = await prisma.user.findMany({
    where: { isOnboarded: true },
    include: {
      profile: true,
    },
  });

  let processed = 0;

  for (const user of users) {
    try {
      const alerts = await alertService.generateDailyAlerts(
        user as User & { profile: any },
      );

      for (const alert of alerts) {
        await prisma.notification.create({
          data: {
            ...alert,
            userId: user.id,
          },
        });
        console.log(`✅ Alert sent to ${user.email} | ${alert.title}`);

        await pushService.sendToUser(user.id, {
          title: alert.title,
          body: alert.message,
          data: {
            actionLink: alert.actionLink,
            type: alert.type,
          },
        });
      }
      processed++;
    } catch (err) {
      console.error(`Failed to process alerts for user ${user.id}:`, err);
    }
  }

  console.log(`📊 Daily alert job completed for ${processed} users`);
}
