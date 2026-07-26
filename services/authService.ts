// services/authService.ts
//@ts-nocheck
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../config/connectDb.js";
import {
  languageSchema,
  registerSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from "../schema/authSchema.js";
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

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const validated = updateProfileSchema.parse(data);

    // Ensure the profile row exists (it should after registration)
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new Error("Profile not found. Please complete registration first.");
    }

    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data: {
        ...(validated.fullName !== undefined && {
          fullName: validated.fullName,
        }),
        ...(validated.location !== undefined && {
          location: validated.location,
        }),
      },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        location: true,
        preferredCrops: true,
      },
    });

    return {
      success: true,
      message: "Profile updated successfully",
      profile: updatedProfile,
    };
  },

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // 1. Fetch current profile so we know the old avatarUrl (if any)
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });

    if (!profile) {
      throw new Error("Profile not found. Please complete registration first.");
    }

    // 2. Upload the new image to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "crop-diagnose/avatars",
            resource_type: "image",
            transformation: [
              { width: 400, height: 400, crop: "fill", gravity: "face" }, // square crop focused on face
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        )
        .end(file.buffer);
    });

    const newAvatarUrl = uploadResult.secure_url as string;

    // 3. Best-effort delete of the previous Cloudinary image (never throws)
    if (profile.avatarUrl) {
      try {
        // Extract public_id from a typical Cloudinary URL
        // Example: https://res.cloudinary.com/xxx/image/upload/v123/crop-diagnose/avatars/abc.jpg
        const parts = profile.avatarUrl.split("/");
        const uploadIndex = parts.findIndex((p) => p === "upload");
        if (uploadIndex !== -1) {
          // Everything after "upload/vXXXX/" becomes the public_id (without extension)
          const publicIdWithExt = parts.slice(uploadIndex + 2).join("/");
          const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ""); // strip extension
          await cloudinary.uploader.destroy(publicId);
          console.log("🗑️ Old avatar deleted from Cloudinary:", publicId);
        }
      } catch (deleteError: any) {
        // IMPORTANT: never block the new upload if delete fails
        console.warn(
          "⚠️ Failed to delete old avatar (non-blocking):",
          deleteError.message,
        );
      }
    }

    // 4. Persist the new URL
    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data: { avatarUrl: newAvatarUrl },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        location: true,
        preferredCrops: true,
      },
    });

    return {
      success: true,
      message: "Avatar updated successfully",
      avatarUrl: newAvatarUrl,
      profile: updatedProfile,
    };
  },
};
