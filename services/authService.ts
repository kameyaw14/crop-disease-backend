// services/authService.ts
// NEW FILE

import { prisma } from "../config/connectDb.js";
import { registerSchema } from "../schema/authSchema.js";
import bcrypt from "bcrypt";
import { jwtUtils } from "../utils/jwtUtils.js";



export const authService = {
  async register(data: any) {
    const validated = registerSchema.parse(data);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      throw new Error("User with this email already exists");
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

    return { user: { id: user.id, email: user.email, role: user.role }, token };
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

    return { user, token };
  },

  async getMe(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
      omit: { password: true },
    });
  },
};
