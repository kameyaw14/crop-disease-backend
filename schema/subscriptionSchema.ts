import { z } from "zod";

// amount is in pesewas: 50 GHS = 5000
export const subscribeSchema = z.object({
  email: z.string().email("Valid email is required"),
  amount: z
    .number()
    .int()
    .positive("Amount must be a positive integer (pesewas)"),
  currency: z.literal("GHS"),
  reference: z.string().min(1).max(100).optional(),
  metadata: z
    .object({
      planCode: z.literal("FARMER_MONTHLY").default("FARMER_MONTHLY"),
    })
    .optional()
    .default({ planCode: "FARMER_MONTHLY" }),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
