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
    //  Detection.cropType is now the CropType enum, same as
    // UserPreferredCrop.cropType, so no case conversion is needed anymore.
    // Both columns are guaranteed by Postgres to only ever contain the exact
    // same set of uppercase values (e.g. "MAIZE").
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
      //  removed the .toLowerCase() conversion, both sides of this
      // comparison are now the same CropType enum value, so a direct
      // comparison works correctly.
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

    //  cropType arrives from the URL param (req.params.cropType) as
    // whatever case the client sent. UserPreferredCrop.cropType is the Prisma
    // CropType enum, which only accepts uppercase values (e.g. "MAIZE"), so we
    // normalize here before it touches any UserPreferredCrop query. Without
    // this, a lowercase or mixed-case param would throw the same
    // "Invalid value for argument cropType. Expected CropType." error we fixed
    // earlier in isCropInPreferred.
    const normalizedCropType = cropType.toUpperCase();

    const updated = await prisma.userPreferredCrop.update({
      where: { userId_cropType: { userId, cropType: normalizedCropType } },
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
    //  same enum-casing fix as updatePreferredCrop above, applied
    // before the value is used in a UserPreferredCrop query.
    const normalizedCropType = cropType.toUpperCase();

    await prisma.userPreferredCrop.delete({
      where: { userId_cropType: { userId, cropType: normalizedCropType } },
    });

    return {
      success: true,
      message: "Crop removed from your list.",
    };
  },

  async isCropInPreferred(userId: string, cropType: string) {
    //  normalizing here too, so this function is safe to call with
    // any casing. Previously this relied on the caller (detectionService.ts)
    // remembering to uppercase the value first, which is exactly what caused
    // the original "Expected CropType" crash. Defensive normalization at the
    // boundary of the function is more reliable than trusting every call site.
    const normalizedCropType = cropType.toUpperCase();

    const existing = await prisma.userPreferredCrop.findUnique({
      where: { userId_cropType: { userId, cropType: normalizedCropType } },
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

    //  Detection.cropType and UserPreferredCrop.cropType are both
    // the CropType enum now, so only one normalized form is needed instead
    // of the previous upper/lower split. We still uppercase here because the
    // value comes from a raw URL param (e.g. /my-crops/maize/history), and a
    // client could send any casing in the URL, so we normalize it to match
    // what the enum expects rather than rejecting the request outright.
    const normalizedCropType = cropType.toUpperCase();

    const preferredCrop = await prisma.userPreferredCrop.findUnique({
      where: { userId_cropType: { userId, cropType: normalizedCropType } },
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
      //  was lowerCropType (a separate normalized variant), now uses
      // the same normalizedCropType used for the UserPreferredCrop check
      // above, since both tables agree on casing now.
      cropType: normalizedCropType,
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
