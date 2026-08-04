// schema/tipSchema.ts

import { z } from "zod";

export const dailyTipItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  order: z.number().int().min(1).max(5),
  // optional metadata for client analytics / UI badges
  themes: z.array(z.string()).optional(),
  cropTypes: z.array(z.string()).optional(),
  personalized: z.boolean().optional(),
});

export type DailyTipItem = z.infer<typeof dailyTipItemSchema>;

export const todayTipsResponseSchema = z.object({
  success: z.boolean(),
  date: z.string(), // YYYY-MM-DD Africa/Accra
  tips: z.array(dailyTipItemSchema).min(1).max(5),
  fromCache: z.boolean().optional(),
  message: z.string().optional(),
});

export type TodayTipsResponse = z.infer<typeof todayTipsResponseSchema>;
