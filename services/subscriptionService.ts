// services\subscriptionService.ts
import { prisma } from "../config/connectDb.js";
import type { SubscribeInput } from "../schema/subscriptionSchema.js";

const ACCRA_TZ = "Africa/Accra";
const FARMER_PLAN_CODE = "FARMER_MONTHLY";
const EXPECTED_AMOUNT_PESEWAS = 5000; // 50 GHS

//  Calendar parts in Africa/Accra (year, month 1-12, day)
function getAccraDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ACCRA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"), // 1-12
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

//  Start/end of current calendar month in Accra, returned as UTC Date bounds for Prisma
function getAccraMonthUtcRange(now: Date = new Date()) {
  const { year, month } = getAccraDateParts(now);
  // Approximate: construct ISO strings at Accra midnight by using offset-aware interpretation
  // We query with string bounds derived from Accra calendar month labels.
  const startLabel = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endLabel = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`;

  // Treat these as Accra local wall times converted via Date parsing with explicit offset
  // Ghana is UTC+0 year-round, so Accra local == UTC. Safe for this project.
  const start = new Date(`${startLabel}.000Z`);
  const end = new Date(`${endLabel}.000Z`);
  return { start, end };
}

//  Same calendar day next month; clamp to last day if day does not exist (31 Jan -> 28/29 Feb)
function addOneCalendarMonthClamped(from: Date): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth(); // 0-11
  const day = from.getUTCDate();
  const hours = from.getUTCHours();
  const minutes = from.getUTCMinutes();
  const seconds = from.getUTCSeconds();
  const ms = from.getUTCMilliseconds();

  const targetMonthIndex = month + 1; // may roll into next year via Date
  const lastDayOfTarget = new Date(
    Date.UTC(year, targetMonthIndex + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);

  return new Date(
    Date.UTC(year, targetMonthIndex, clampedDay, hours, minutes, seconds, ms),
  );
}

export const subscriptionService = {
  //  Active paid subscription if status ACTIVE and now < endsAt
  async getActivePaidSubscription(userId: string) {
    const now = new Date();
    const sub = await prisma.userSubscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        endsAt: { gt: now },
        plan: { code: FARMER_PLAN_CODE, isActive: true },
      },
      include: { plan: true },
      orderBy: { endsAt: "desc" },
    });
    return sub;
  },

  //  Whether user may see weather crop insights
  async canSeeCropInsights(userId: string): Promise<boolean> {
    const paid = await this.getActivePaidSubscription(userId);
    return Boolean(paid?.plan?.hasCropInsights);
  },

  //  Count successful detections in current Accra calendar month
  async countSuccessfulScansThisMonth(userId: string): Promise<number> {
    const { start, end } = getAccraMonthUtcRange();
    return prisma.detection.count({
      where: {
        userId,
        createdAt: { gte: start, lt: end },
        // Successful rows only exist when a real diagnosis was stored
      },
    });
  },

  //  Remaining free scans (0 if paid or quota used)
  async getRemainingFreeScans(userId: string): Promise<number> {
    const paid = await this.getActivePaidSubscription(userId);
    if (paid) return 0; // paid users do not use free quota messaging the same way

    const used = await this.countSuccessfulScansThisMonth(userId);
    const remaining = Math.max(0, 5 - used);
    return remaining;
  },

  //  Gate for detection — paid unlimited; free max 5 successful / Accra month
  async canDetect(userId: string): Promise<{
    allowed: boolean;
    isPaid: boolean;
    remainingFreeScans: number;
    message?: string;
  }> {
    const paid = await this.getActivePaidSubscription(userId);
    if (paid) {
      return { allowed: true, isPaid: true, remainingFreeScans: 0 };
    }

    const remaining = await this.getRemainingFreeScans(userId);
    if (remaining <= 0) {
      return {
        allowed: false,
        isPaid: false,
        remainingFreeScans: 0,
        message:
          "You have used your 5 free scans for this month. Upgrade to Farmer Monthly to continue.",
      };
    }

    return { allowed: true, isPaid: false, remainingFreeScans: remaining };
  },

  //  Status payload for GET /api/subscribe/status
  async getStatus(userId: string) {
    const paid = await this.getActivePaidSubscription(userId);
    const used = await this.countSuccessfulScansThisMonth(userId);
    const remainingFreeScans = paid ? 0 : Math.max(0, 5 - used);

    if (paid) {
      return {
        success: true,
        plan: paid.plan.code,
        planName: paid.plan.name,
        isPaid: true,
        status: paid.status,
        startsAt: paid.startsAt,
        endsAt: paid.endsAt,
        scanLimit: null as number | null,
        remainingFreeScans: 0,
        hasCropInsights: true,
        amountGhs: paid.amountGhs,
        source: paid.source,
      };
    }

    return {
      success: true,
      plan: "FREE",
      planName: "Free",
      isPaid: false,
      status: null,
      startsAt: null,
      endsAt: null,
      scanLimit: 5,
      remainingFreeScans,
      scansUsedThisMonth: used,
      hasCropInsights: false,
      amountGhs: 0,
      source: null,
    };
  },

  //  Demo activation via Paystack-shaped body (no real charge)
  async activateDemoSubscription(userId: string, input: SubscribeInput) {
    // Validate expected demo amount (50 GHS = 5000 pesewas)
    if (input.amount !== EXPECTED_AMOUNT_PESEWAS) {
      throw new Error(
        "Invalid amount. Farmer Monthly is 50 GHS (5000 pesewas).",
      );
    }

    if (input.currency !== "GHS") {
      throw new Error("Currency must be GHS.");
    }

    const planCode = input.metadata?.planCode ?? FARMER_PLAN_CODE;
    if (planCode !== FARMER_PLAN_CODE) {
      throw new Error("Only FARMER_MONTHLY is available.");
    }

    const existing = await this.getActivePaidSubscription(userId);
    if (existing) {
      throw new Error(
        `You already have an active plan until ${existing.endsAt.toISOString()}.`,
      );
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { code: FARMER_PLAN_CODE },
    });

    if (!plan || !plan.isActive) {
      throw new Error("Farmer Monthly plan is not available.");
    }

    const startsAt = new Date();
    const endsAt = addOneCalendarMonthClamped(startsAt);

    const subscription = await prisma.userSubscription.create({
      data: {
        userId,
        planId: plan.id,
        status: "ACTIVE",
        startsAt,
        endsAt,
        source: "DEMO",
        externalRef: input.reference ?? null,
        amountGhs: 50,
      },
      include: { plan: true },
    });

    return {
      success: true,
      message: "Farmer Monthly activated successfully (demo payment).",
      plan: subscription.plan.code,
      planName: subscription.plan.name,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      amountGhs: 50,
      source: "DEMO",
      reference: input.reference ?? null,
    };
  },

  async activateFromPayment(params: {
    userId: string;
    reference: string;
    amountGhs: number;
  }) {
    const alreadyUsed = await prisma.userSubscription.findFirst({
      where: { externalRef: params.reference },
      include: { plan: true },
    });
    if (alreadyUsed) {
      return alreadyUsed;
    }

    const existing = await this.getActivePaidSubscription(params.userId);
    if (existing) {
      throw new Error(
        `You already have an active plan until ${existing.endsAt.toISOString()}.`,
      );
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { code: FARMER_PLAN_CODE },
    });
    if (!plan || !plan.isActive) {
      throw new Error("Farmer Monthly plan is not available.");
    }

    if (params.amountGhs !== 50) {
      throw new Error("Payment amount does not match Farmer Monthly price.");
    }

    const startsAt = new Date();
    const endsAt = addOneCalendarMonthClamped(startsAt);

    return prisma.userSubscription.create({
      data: {
        userId: params.userId,
        planId: plan.id,
        status: "ACTIVE",
        startsAt,
        endsAt,
        source: "PAYSTACK",
        externalRef: params.reference,
        amountGhs: params.amountGhs,
      },
      include: { plan: true },
    });
  },
};
