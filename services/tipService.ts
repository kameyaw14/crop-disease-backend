// services/tipService.ts
// @ts-nocheck

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../config/connectDb.js";
import { env } from "../utils/env.js";
import { getDailyTipsRankPrompt } from "../utils/prompts.js";
import type { DailyTipItem } from "../schema/tipSchema.js";
import type { CropType } from "../generated/prisma/client.js";

//  anti-repeat window
const ANTI_REPEAT_DAYS = 14;

//  how many candidates to send to Gemini
const CANDIDATE_LIMIT = 12;

//  always return this many tips when pool allows
const TIPS_PER_DAY = 5;

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

//  Africa/Accra calendar date YYYY-MM-DD
function getAccraDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

//  simple month → season buckets for Ghana (tunable later)
function getSeasonForMonth(month: number): string {
  // 1=Jan ... 12=Dec
  if ([3, 4, 5, 6].includes(month)) return "RAINY_MAJOR";
  if ([9, 10].includes(month)) return "RAINY_MINOR";
  if ([11, 12, 1, 2].includes(month)) return "DRY";
  if ([7, 8].includes(month)) return "HARVEST_WINDOW";
  return "GENERAL";
}

//  crude theme extraction from disease names for matching seed themes
function extractThemesFromDiseaseName(diseaseName: string): string[] {
  const lower = (diseaseName || "").toLowerCase();
  const themes: string[] = ["prevention"];
  if (
    lower.includes("rust") ||
    lower.includes("blight") ||
    lower.includes("mildew") ||
    lower.includes("fung")
  ) {
    themes.push("fungal");
  }
  if (lower.includes("virus") || lower.includes("mosaic")) themes.push("viral");
  if (lower.includes("bacterial") || lower.includes("wilt"))
    themes.push("bacterial");
  if (
    lower.includes("pest") ||
    lower.includes("borer") ||
    lower.includes("aphid")
  )
    themes.push("pest");
  if (lower.includes("rust")) themes.push("rust");
  if (lower.includes("blight")) themes.push("blight");
  return themes;
}

// ===== NO CHANGES BELOW: scoring logic is unchanged from the original =====

//  score a tip against user context (rules layer before Gemini)
function scoreTip(
  tip: {
    id: string;
    weight: number;
    cropTypes: CropType[];
    regions: string[];
    months: number[];
    themes: string[];
  },
  ctx: {
    preferredCrops: string[];
    region?: string | null;
    month: number;
    recentCropTypes: string[];
    recentThemes: string[];
  },
): number {
  let score = tip.weight || 1;

  // crop match
  if (tip.cropTypes.length === 0) {
    score += 1; // general still useful
  } else {
    const cropHit = tip.cropTypes.some(
      (c) => ctx.preferredCrops.includes(c) || ctx.recentCropTypes.includes(c),
    );
    if (cropHit) score += 5;
    else score -= 2;
  }

  // region
  if (tip.regions.length === 0) {
    score += 1;
  } else if (ctx.region && tip.regions.includes(ctx.region)) {
    score += 3;
  } else if (ctx.region) {
    score -= 1;
  }

  // month
  if (tip.months.length === 0) {
    score += 1;
  } else if (tip.months.includes(ctx.month)) {
    score += 3;
  } else {
    score -= 2;
  }

  // recent disease themes
  if (tip.themes.length > 0 && ctx.recentThemes.length > 0) {
    const themeHit = tip.themes.some((t) =>
      ctx.recentThemes.map((x) => x.toLowerCase()).includes(t.toLowerCase()),
    );
    if (themeHit) score += 6;
  }

  return score;
}

// ===== END NO-CHANGES SECTION =====

// NEW ADDITION: shape of one entry in the "working" scored pool, extracted
// here as a named type so topUpTips() below can accept the same shape that
// getTodayTips() already builds, without needing `any`.
type ScoredCandidate = {
  tip: {
    id: string;
    title: string;
    body: string;
    themes: string[];
    cropTypes: CropType[];
  };
  score: number;
};

// NEW ADDITION: fixes the "fewer than 5 tips" gap (issue #1 from the review).
// This runs AFTER Gemini ranking (or the rules-only fallback) and tops up
// the final list from the same scored candidate pool, skipping any tip
// already selected. It cannot invent tips that don't exist in the pool, but
// it guarantees we never return fewer tips than the pool actually has
// available just because Gemini decided to hand back 3 instead of 5.
function topUpTips(
  tips: DailyTipItem[],
  workingPool: ScoredCandidate[],
): DailyTipItem[] {
  if (tips.length >= TIPS_PER_DAY) return tips;

  // TypeScript: Set<string> gives O(1) "have we already used this id" checks
  // instead of calling .includes() inside the loop below.
  const usedIds = new Set(tips.map((t) => t.id));

  for (const { tip } of workingPool) {
    if (tips.length >= TIPS_PER_DAY) break;
    if (usedIds.has(tip.id)) continue;

    tips.push({
      id: tip.id,
      title: tip.title,
      body: tip.body,
      order: tips.length + 1, // reassigned again in the final slice/map below
      themes: tip.themes,
      cropTypes: tip.cropTypes.map(String),
      personalized: false,
    });
    usedIds.add(tip.id);
  }

  return tips;
}

//  Gemini rank + light personalize; falls back to rules order
async function rankAndPersonalizeWithGemini(
  candidates: Array<{
    id: string;
    title: string;
    body: string;
    themes: string[];
    cropTypes: string[];
  }>,
  userContext: {
    preferredCrops: string[];
    region?: string | null;
    month: number;
    season: string;
    recentDetections: Array<{ cropType: string; diseaseName: string }>;
  },
): Promise<DailyTipItem[] | null> {
  if (!env.GEMINI_API_KEY || candidates.length === 0) return null;

  const responseSchema = {
    type: "object",
    properties: {
      tips: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            order: { type: "number" },
          },
          required: ["id", "title", "body", "order"],
        },
      },
    },
    required: ["tips"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        getDailyTipsRankPrompt(),
        JSON.stringify({
          userContext,
          candidates,
          instruction: `Return up to ${TIPS_PER_DAY} tips, ordered 1..N. Prefer diversity (not 5 near-identical themes).`,
        }),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    if (!Array.isArray(parsed.tips) || parsed.tips.length === 0) return null;

    // UPDATED: previously this loop assumed `parsed.tips` was already in the
    // correct order and just used array position. Gemini's own `order` field
    // was requested but never actually checked, so a JSON response that came
    // back out of sequence would silently produce a wrong ranking. Sorting
    // by `order` first makes the array position and the intended rank agree.
    const sortedTips = [...parsed.tips].sort(
      (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
    );

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const out: DailyTipItem[] = [];

    for (const t of sortedTips) {
      const base = byId.get(t.id);
      if (!base) continue;
      out.push({
        id: t.id,
        title: t.title || base.title,
        body: t.body || base.body,
        order: out.length + 1,
        themes: base.themes,
        cropTypes: base.cropTypes,
        personalized: t.title !== base.title || t.body !== base.body,
      });
      if (out.length >= TIPS_PER_DAY) break;
    }

    return out.length > 0 ? out : null;
  } catch (err: any) {
    console.error("❌ Gemini tip rank failed:", err?.message || err);
    return null;
  }
}

export const tipService = {
  //  main entry — returns up to 5 tips when possible, stable for the Accra calendar day
  async getTodayTips(userId: string) {
    const date = getAccraDateString();

    // 1) Day cache hit
    const cached = await prisma.userDailyTipsCache.findUnique({
      where: { userId_date: { userId, date } },
    });

    if (cached) {
      return {
        success: true,
        date,
        tips: cached.tipsJson as DailyTipItem[],
        fromCache: true,
        message: "Today's tips loaded.",
      };
    }

    // 2) Load user context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userPreferredCrops: true,
      },
    });

    if (!user) {
      return {
        success: false,
        date,
        tips: [],
        message: "User not found",
      };
    }

    const preferredCrops = [
      ...(user.profile?.preferredCrops || []),
      ...user.userPreferredCrops.map((c) => c.cropType),
    ].map(String);

    const region = user.profile?.communityRegion || null;

    const now = new Date();
    const month = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Accra",
        month: "numeric",
      }).format(now),
    );
    const season = getSeasonForMonth(month);

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentDetections = await prisma.detection.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { cropType: true, diseaseName: true },
    });

    const recentCropTypes = recentDetections.map((d) => String(d.cropType));
    const recentThemes = Array.from(
      new Set(
        recentDetections.flatMap((d) =>
          extractThemesFromDiseaseName(d.diseaseName),
        ),
      ),
    );

    // 3) Anti-repeat: tip IDs served in last 14 days
    const recentServings = await prisma.userTipServing.findMany({
      where: {
        userId,
        servedAt: {
          gte: new Date(Date.now() - ANTI_REPEAT_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      select: { tipId: true },
    });
    const excludeIds = new Set(recentServings.map((s) => s.tipId));

    // 4) Load active tips and filter in memory (arrays are flexible for v1)
    const allActive = await prisma.dailyTip.findMany({
      where: { isActive: true },
    });

    const eligible = allActive.filter((tip) => {
      if (excludeIds.has(tip.id)) return false;

      // region: empty = nationwide
      if (tip.regions.length > 0 && region && !tip.regions.includes(region)) {
        // still allow if no region on user — already handled by region falsy
        // if user has region and tip is region-specific and no match → drop
        return false;
      }

      // months: empty = anytime
      if (tip.months.length > 0 && !tip.months.includes(month)) {
        return false;
      }

      return true;
    });

    // 5) Score + take top candidates
    const scored = eligible
      .map((tip) => ({
        tip,
        score: scoreTip(tip, {
          preferredCrops,
          region,
          month,
          recentCropTypes,
          recentThemes,
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_LIMIT);

    // Fallback if filters were too strict: relax region/month by using all active not excluded
    let working = scored;
    if (working.length < TIPS_PER_DAY) {
      const relaxed = allActive
        .filter((t) => !excludeIds.has(t.id))
        .map((tip) => ({
          tip,
          score: scoreTip(tip, {
            preferredCrops,
            region,
            month,
            recentCropTypes,
            recentThemes,
          }),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, CANDIDATE_LIMIT);
      working = relaxed;
    }

    const candidates = working.map(({ tip }) => ({
      id: tip.id,
      title: tip.title,
      body: tip.body,
      themes: tip.themes,
      cropTypes: tip.cropTypes.map(String),
    }));

    // 6) Gemini rank/personalize → fallback to rules order
    let tips: DailyTipItem[] | null = await rankAndPersonalizeWithGemini(
      candidates,
      {
        preferredCrops,
        region,
        month,
        season,
        recentDetections: recentDetections.map((d) => ({
          cropType: String(d.cropType),
          diseaseName: d.diseaseName,
        })),
      },
    );

    if (!tips) {
      tips = candidates.slice(0, TIPS_PER_DAY).map((c, i) => ({
        id: c.id,
        title: c.title,
        body: c.body,
        order: i + 1,
        themes: c.themes,
        cropTypes: c.cropTypes,
        personalized: false,
      }));
    }

    // NEW ADDITION: top up to TIPS_PER_DAY from the same scored "working" pool
    // whenever Gemini handed back fewer than 5, or the rules fallback above
    // only produced a handful. See topUpTips() for details. This runs before
    // the final slice/reindex so the order numbers below stay correct.
    tips = topUpTips(tips, working);

    // Pad only if pool is smaller than 5 (should be rare after seeding)
    tips = tips.slice(0, TIPS_PER_DAY).map((t, i) => ({ ...t, order: i + 1 }));

    if (tips.length === 0) {
      return {
        success: false,
        date,
        tips: [],
        message:
          "No tips available yet. Please seed the daily tips pool and try again.",
      };
    }

    // 7) Persist day cache + anti-repeat servings
    const tipIds = tips.map((t) => t.id);

    // UPDATED: previously this used prisma.$transaction with an unconditional
    // upsert + createMany, which had two problems: (1) two near-simultaneous
    // requests for the same user/day (e.g. a mobile app double-firing on
    // resume) could each compute a different tip set and the second upsert
    // would silently overwrite the first, and (2) userTipServing.createMany
    // had no unique constraint to protect against duplicate rows, so a
    // retried request would double-count servings and eat into the
    // anti-repeat pool for tips the user never actually saw twice.
    // Now we re-check for an existing cache row INSIDE the transaction right
    // before writing. If another request already wrote today's cache first,
    // we return ITS tips instead of overwriting, so the cache the user sees
    // and the servings we record always match each other.
    const finalTips = await prisma.$transaction(async (tx) => {
      const existingCache = await tx.userDailyTipsCache.findUnique({
        where: { userId_date: { userId, date } },
      });

      if (existingCache) {
        // TypeScript: `as DailyTipItem[]` because Prisma's Json field type is
        // just `JsonValue`, so we assert the shape we know we stored earlier.
        return existingCache.tipsJson as DailyTipItem[];
      }

      await tx.userDailyTipsCache.create({
        data: {
          userId,
          date,
          tipsJson: tips!,
          tipIds,
        },
      });

      await tx.userTipServing.createMany({
        data: tipIds.map((tipId) => ({ userId, tipId, date })),
        // NEW ADDITION: relies on the new @@unique([userId, tipId, date])
        // constraint added to schema.prisma. Without it, skipDuplicates has
        // nothing to check against and silently does nothing.
        skipDuplicates: true,
      });

      return tips!;
    });

    return {
      success: true,
      date,
      tips: finalTips,
      fromCache: false,
      message: "Today's tips ready.",
    };
  },
};
