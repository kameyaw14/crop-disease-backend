// services/cropService.ts
import { prisma } from "../config/connectDb.js";

export const cropService = {
  async getMyCrops(userId: string) {
    const preferredCrops = await prisma.userPreferredCrop.findMany({
      where: { userId },
      select: {
        cropType: true,
      },
      orderBy: {
        cropType: "asc",
      },
    });

    const crops = preferredCrops.map((item) => ({
      cropType: item.cropType,
    }));

    return {
      success: true,
      crops,
      total: crops.length,
      message:
        crops.length > 0
          ? "Preferred crops retrieved successfully"
          : "You have not added any preferred crops yet",
    };
  },
};
