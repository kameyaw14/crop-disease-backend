// services/authService.ts
//@ts-nocheck
import { prisma } from "../config/connectDb.js";
import { languageSchema, registerSchema } from "../schema/authSchema.js";
import bcrypt from "bcrypt";
import { jwtUtils } from "../utils/jwtUtils.js";

export const authService = {
  async register(data: any) {
    const validated = registerSchema.parse(data);

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: validated.email },
          { phoneNumber: validated.phoneNumber },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === validated.email) {
        throw new Error("User with this email already exists");
      }
      throw new Error("This phone number is already registered");
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        password: hashedPassword,
        role: validated.role as any,
        phoneNumber: validated.phoneNumber,
        isOnboarded: true,
      },
    });

    // Create Profile
    await prisma.profile.create({
      data: {
        userId: user.id,
        fullName: validated.fullName,
        location: validated.location || null,
        preferredCrops: validated.preferredCrops as any,
      },
    });

    // Link preferred crops in junction table
    if (validated.preferredCrops.length > 0) {
      await prisma.userPreferredCrop.createMany({
        data: validated.preferredCrops.map((crop: string) => ({
          userId: user.id,
          cropType: crop as any,
        })),
        skipDuplicates: true,
      });
    }

    const token = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Simulate email verification
    console.log(`📧 Verification email would be sent to: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isEmailVerified: user.isEmailVerified,
      },
      token,
    };
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error("Invalid email or password");
    }

    const token = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { password: _password, ...safeUser } = user;

    return { user: safeUser, token };
  },

  async getMe(userId: string) {
    const [user, unreadNotificationsCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          _count: {
            select: {
              userPreferredCrops: true,
              detections: true,
              notifications: true,
            },
          },
        },
        omit: { password: true },
      }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    if (!user) {
      return null;
    }

    const { _count, ...safeUser } = user;

    const stats = {
      cropsCount: _count.userPreferredCrops,
      detectionsCount: _count.detections,
      notificationsCount: _count.notifications,
      unreadNotificationsCount,
    };

    return {
      user: safeUser,
      stats,
    };
  },

  async updateLanguage(userId: string, data: any) {
    const validated = languageSchema.parse(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { language: validated.language },
      select: {
        id: true,
        email: true,
        language: true,
      },
    });

    return {
      success: true,
      message: `Language updated successfully to ${validated.language === "tw" ? "Twi" : "English"}`,
      language: user.language,
    };
  },
};
