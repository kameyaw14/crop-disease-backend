// services/alertService.ts
//@ts-nocheck
import type { User } from "../generated/prisma/client.js";
import { weatherService } from "./weatherService.js";

type AlertData = {
  type: "DAILY_SUMMARY" | "HIGH_RISK" | "CROP_SPECIFIC" | "FAVORABLE_CONDITION";
  title: string;
  message: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  expiresAt?: Date;
  actionLink?: string;
  metadata?: any;
};

export const alertService = {
  async generateDailyAlerts(
    user: User & { profile: any },
  ): Promise<AlertData[]> {
    const alerts: AlertData[] = [];

    // Get today's weather + risk insights
    const forecast = await weatherService.getForecast(user.id);

    if (!forecast.success || !forecast.data) {
      return alerts;
    }

    const { riskInsights, overallSummary } = forecast.data;
    const fullName = user.profile?.fullName?.split(" ")[0] || "Farmer";

    // 1. High Risk Alerts (Priority)
    const highRisk = riskInsights.filter((r) => r.riskLevel === "High");
    if (highRisk.length > 0) {
      const crops = highRisk.map((r) => r.crop).join(" and ");
      alerts.push({
        type: "HIGH_RISK",
        title: `High Disease Risk Alert for ${crops}`,
        message: `Hi ${fullName}, high fungal risk detected for your ${crops}. Apply neem oil or organic fungicide today and improve drainage. Stay safe!`,
        priority: "HIGH",
        actionLink: "/weather",
        metadata: { affectedCrops: highRisk },
      });
    }

    // 2. Daily Summary (Always)
    alerts.push({
      type: "DAILY_SUMMARY",
      title: "Morning Farm Update",
      message: `Good morning ${fullName}! ${overallSummary} Check your crops and have a productive day.`,
      priority: "MEDIUM",
      actionLink: "/weather",
      metadata: { riskInsights },
    });

    // 3. Crop-Specific Positive Reinforcement (if low risk)
    const lowRiskCrops = riskInsights.filter((r) => r.riskLevel === "Low");
    if (lowRiskCrops.length > 0 && highRisk.length === 0) {
      alerts.push({
        type: "FAVORABLE_CONDITION",
        title: "Great Conditions!",
        message: `Excellent weather for your ${lowRiskCrops[0].crop}. Keep up the good work!`,
        priority: "LOW",
        actionLink: "/dashboard",
      });
    }

    // Deduplication logic (max 2 alerts/day) - already handled by priority order
    return alerts.slice(0, 2);
  },
};
