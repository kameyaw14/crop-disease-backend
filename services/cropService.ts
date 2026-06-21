// services/cropService.ts
import { prisma } from "../config/connectDb.js";
import {
  addPreferredCropSchema,
  getCropHistorySchema,
  updatePreferredCropSchema,
  type AddPreferredCropInput,
  type GetCropHistoryInput,
  type UpdatePreferredCropInput,
} from "../schema/cropSchema.js";

export const cropService = {
  async getMyCrops(userId: string) {
    // Step 1: Get all preferred crops
    const preferredCrops = await prisma.userPreferredCrop.findMany({
      where: { userId },
      orderBy: [{ lastActivityDate: "desc" }, { cropType: "asc" }],
    });

    // Step 2: Get latest detection for each crop (more reliable than complex include)
    const cropTypes = preferredCrops.map((c) => c.cropType);
    let latestDetections: any[] = [];

    if (cropTypes.length > 0) {
      latestDetections = await prisma.detection.findMany({
        where: {
          userId,
          cropType: { in: cropTypes },
        },
        orderBy: { createdAt: "desc" },
        distinct: ["cropType"], // Get only the most recent per crop
        select: {
          cropType: true,
          diseaseName: true,
          createdAt: true,
          confidence: true,
        },
      });
    }

    const crops = preferredCrops.map((item) => {
      const lastDetection = latestDetections.find(
        (d) => d.cropType === item.cropType,
      );

      // Simple risk calculation (lightweight, no heavy computation)
      let riskLevel = "LOW";
      if (lastDetection && lastDetection.confidence > 0.7) riskLevel = "HIGH";
      else if (lastDetection) riskLevel = "MEDIUM";

      return {
        cropType: item.cropType,
        customName: item.customName,
        status: item.status,
        farmSize: item.farmSize,
        farmSizeUnit: item.farmSizeUnit,
        plantingDate: item.plantingDate,
        expectedHarvestDate: item.expectedHarvestDate,
        notes: item.notes,
        lastActivityDate: item.lastActivityDate,
        lastDetection: lastDetection
          ? {
              diseaseName: lastDetection.diseaseName,
              date: lastDetection.createdAt,
              confidence: lastDetection.confidence,
            }
          : null,
        riskLevel,
      };
    });

    return {
      success: true,
      crops,
      total: crops.length,
      message:
        crops.length > 0
          ? "Your crops retrieved successfully. Keep growing strong!"
          : "You have not added any preferred crops yet. Add some to start tracking.",
    };
  },

  //  Add new preferred crop
  async addPreferredCrop(userId: string, input: AddPreferredCropInput) {
    const validated = addPreferredCropSchema.parse(input); // TypeScript: Zod ensures type safety at runtime

    const existing = await prisma.userPreferredCrop.findUnique({
      where: { userId_cropType: { userId, cropType: validated.cropType } },
    });

    if (existing) {
      return {
        success: false,
        message: "This crop is already in your list.",
      };
    }

    const crop = await prisma.userPreferredCrop.create({
      data: {
        userId,
        cropType: validated.cropType,
        customName: validated.customName,
        plantingDate: validated.plantingDate
          ? new Date(validated.plantingDate)
          : undefined,
        expectedHarvestDate: validated.expectedHarvestDate
          ? new Date(validated.expectedHarvestDate)
          : undefined,
        farmSize: validated.farmSize,
        notes: validated.notes,
      },
    });

    return {
      success: true,
      data: crop,
      message: `${validated.cropType} added to your crops successfully. Great choice!`,
    };
  },

  //  Update existing preferred crop
  async updatePreferredCrop(
    userId: string,
    cropType: string,
    input: UpdatePreferredCropInput,
  ) {
    const validated = updatePreferredCropSchema.parse(input);

    const updated = await prisma.userPreferredCrop.update({
      where: { userId_cropType: { userId, cropType } },
      data: {
        ...validated,
        plantingDate: validated.plantingDate
          ? new Date(validated.plantingDate)
          : undefined,
        expectedHarvestDate: validated.expectedHarvestDate
          ? new Date(validated.expectedHarvestDate)
          : undefined,
      },
    });

    return {
      success: true,
      data: updated,
      message: "Crop details updated successfully.",
    };
  },

  //  Remove preferred crop
  async deletePreferredCrop(userId: string, cropType: string) {
    await prisma.userPreferredCrop.delete({
      where: { userId_cropType: { userId, cropType } },
    });

    return {
      success: true,
      message: "Crop removed from your list.",
    };
  },

  async isCropInPreferred(userId: string, cropType: string) {
    const existing = await prisma.userPreferredCrop.findUnique({
      where: { userId_cropType: { userId, cropType } },
      select: { cropType: true },
    });

    return !!existing;
  },

  async getCropHistory(
    userId: string,
    cropType: string,
    query: GetCropHistoryInput,
  ) {
    const validated = getCropHistorySchema.parse(query);

    const preferredCrop = await prisma.userPreferredCrop.findUnique({
      where: { userId_cropType: { userId, cropType } },
    });

    if (!preferredCrop) {
      return {
        success: false,
        message:
          "This crop is not in your preferred list. Please add it first.",
      };
    }

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 10, 50);
    const skip = (page - 1) * limit;

    // Build where clause with optional filters
    const whereClause: any = {
      userId,
      cropType,
    };

    if (validated.startDate)
      whereClause.createdAt = {
        ...whereClause.createdAt,
        gte: new Date(validated.startDate),
      };
    if (validated.endDate)
      whereClause.createdAt = {
        ...whereClause.createdAt,
        lte: new Date(validated.endDate),
      };
    if (validated.minConfidence)
      whereClause.confidence = { gte: validated.minConfidence };

    // Main history query
    const [history, total] = await Promise.all([
      prisma.detection.findMany({
        where: whereClause,
        select: {
          id: true,
          imageUrl: true,
          diseaseName: true,
          confidence: true,
          symptoms: true,
          createdAt: true,
          localNotes: true,
          aiProvider: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.detection.count({ where: whereClause }),
    ]);

    // Basic aggregates
    const aggregates = await prisma.detection.aggregate({
      where: whereClause,
      _count: { id: true },
      _avg: { confidence: true },
    });

    // Most common disease using groupBy
    const diseaseGroups = await prisma.detection.groupBy({
      by: ["diseaseName"],
      where: whereClause,
      _count: { diseaseName: true },
      orderBy: { _count: { diseaseName: "desc" } },
      take: 1,
    });

    const mostCommonDisease = diseaseGroups[0]?.diseaseName || null;

    return {
      success: true,
      history,
      aggregates: {
        totalDetections: aggregates._count.id,
        avgConfidence: aggregates._avg.confidence
          ? Number(aggregates._avg.confidence.toFixed(2))
          : 0,
        mostCommonDisease,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      message:
        history.length > 0
          ? "Crop history loaded successfully. Learn from your past diagnoses!"
          : "No diagnoses yet for this crop. Take a photo to start building your history.",
    };
  },
};
