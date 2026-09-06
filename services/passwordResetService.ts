// services/passwordResetService.ts
//// @ts-nocheck

import bcrypt from "bcrypt";
import { prisma } from "../config/connectDb.js";
import { jwtUtils } from "../utils/jwtUtils.js";
import { normalizePhoneNumber } from "../utils/phoneUtils.js";
import {
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
} from "../schema/authSchema.js";
import { smsService } from "./smsService.js";

// How long an OTP stays valid after it is issued
const OTP_EXPIRY_MINUTES = 10;

export async function issueAndSendOtp(params: {
  userId: string;
  phoneNumber: string;
}): Promise<{ otpSent: boolean }> {
  const { userId, phoneNumber } = params;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const otpHash = await bcrypt.hash(otp, 12);

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.passwordResetOTP.updateMany({
    where: { userId, isUsed: false },
    data: { isUsed: true },
  });

  await prisma.passwordResetOTP.create({
    data: {
      userId,
      otpHash,
      expiresAt,
    },
  });

  console.log(
    `📱 OTP for ${phoneNumber}: ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`,
  );

  try {
    await smsService.sendSms({
      to: phoneNumber,
      message: `Your Crop Guardian verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
    });
    return { otpSent: true };
  } catch (smsError: any) {
    console.error(
      "Failed to send OTP SMS via Arkesel:",
      smsError?.message || smsError,
    );
    return { otpSent: false };
  }
}

export const passwordResetService = {
  async forgotPassword(data: any) {
    const validated = forgotPasswordSchema.parse(data);

    const normalizedPhone = normalizePhoneNumber(validated.phoneNumber);

    if (!normalizedPhone) {
      throw new Error(
        "Please enter a valid Ghana phone number (e.g. 0244123456 or +233244123456)",
      );
    }

    // Query using the canonical international format
    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      return {
        success: true,
        message: "If this number is registered, an OTP has been sent.",
      };
    }

    // use shared helper instead of inlined OTP + SMS logic
    const { otpSent } = await issueAndSendOtp({
      userId: user.id,
      phoneNumber: normalizedPhone,
    });

    // still return a generic success message for security,
    // but log whether Arkesel actually accepted the message
    if (!otpSent) {
      console.warn(
        `⚠️ OTP created for ${normalizedPhone} but Arkesel send failed`,
      );
    }

    return {
      success: true,
      message: "If this number is registered, an OTP has been sent.",
    };
  },

  async verifyResetOtp(data: any) {
    const validated = verifyResetOtpSchema.parse(data);

    const normalizedPhone = normalizePhoneNumber(validated.phoneNumber);

    if (!normalizedPhone) {
      throw new Error("Invalid phone number format");
    }

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      throw new Error("Invalid or expired OTP");
    }

    const otpRecord = await prisma.passwordResetOTP.findFirst({
      where: {
        userId: user.id,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      throw new Error("Invalid or expired OTP");
    }

    const isMatch = await bcrypt.compare(validated.otp, otpRecord.otpHash);

    if (!isMatch) {
      throw new Error("Invalid or expired OTP");
    }

    await Promise.all([
      prisma.passwordResetOTP.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      }),
    ]);

    const resetToken = jwtUtils.generateResetToken({ userId: user.id });

    return {
      success: true,
      message: "OTP verified successfully",
      resetToken,
    };
  },

  async resetPassword(data: any) {
    const validated = resetPasswordSchema.parse(data);

    let decoded;
    try {
      decoded = jwtUtils.verifyResetToken(validated.resetToken);
    } catch (error) {
      throw new Error("Reset session expired. Please request a new OTP.");
    }

    const hashedPassword = await bcrypt.hash(validated.newPassword, 12);

    await prisma.user.update({
      where: { id: decoded.userId },
      data: { password: hashedPassword },
    });

    return {
      success: true,
      message: "Password reset successfully. You can now log in.",
    };
  },
};
