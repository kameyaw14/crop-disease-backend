// ============================================================
// services/passwordResetService.ts

import bcrypt from "bcrypt";
import { prisma } from "../config/connectDb.js";
import { jwtUtils } from "../utils/jwtUtils.js";
import { normalizePhoneNumber } from "../utils/phoneUtils.js";
import {
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
} from "../schema/authSchema.js";

const OTP_EXPIRY_MINUTES = 10;

export const passwordResetService = {
  // ----------------------------------------------------------
  // Step 1: user submits their phone number.
  // Also doubles as the "resend OTP" action, since calling this
  // again simply invalidates old OTPs and issues a fresh one.
  // ----------------------------------------------------------
  async forgotPassword(data: any) {
    const validated = forgotPasswordSchema.parse(data);

    const normalizedPhone = normalizePhoneNumber(validated.phoneNumber);

    if (!normalizedPhone) {
      // Invalid format, e.g. not a recognized Ghana number shape
      throw new Error(
        "Please enter a valid Ghana phone number (e.g. 0244123456)",
      );
    }

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });

    // SECURITY NOTE: we return the SAME success message whether or
    // not the user exists, so this endpoint can't be used to check
    // which phone numbers are registered (same pattern as login).
    if (!user) {
      return {
        success: true,
        message: "If this number is registered, an OTP has been sent.",
      };
    }

    // Generate a 6-digit numeric OTP, e.g. "048213"
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP before storing, same pattern as password hashing,
    // so a database leak doesn't expose usable OTPs.
    const otpHash = await bcrypt.hash(otp, 12);

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any previous unused OTPs for this user first,
    // so only the newest OTP can ever be successfully verified.
    await prisma.passwordResetOTP.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    await prisma.passwordResetOTP.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
    });

    // TODO: replace this console.log with an Arkesel SMS API call later.
    // Keeping the OTP visible in server logs only, for now, during dev.
    console.log(
      `📱 OTP for ${normalizedPhone}: ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`,
    );

    return {
      success: true,
      message: "If this number is registered, an OTP has been sent.",
    };
  },

  // ----------------------------------------------------------
  // Step 2: user submits phone number + the 6-digit OTP.
  // On success, returns a short-lived reset token (not the
  // user's session token) that step 3 requires.
  // ----------------------------------------------------------
  async verifyResetOtp(data: any) {
    const validated = verifyResetOtpSchema.parse(data);

    const normalizedPhone = normalizePhoneNumber(validated.phoneNumber);

    if (!normalizedPhone) {
      throw new Error("Invalid phone number format");
    }

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });

    // Generic error message intentionally, so we don't confirm
    // whether the phone number exists at this step either.
    if (!user) {
      throw new Error("Invalid or expired OTP");
    }

    // Find the most recent, unused, non-expired OTP for this user.
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

    // Mark this OTP as used so it can never be verified a second time.
    await prisma.passwordResetOTP.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Issue the short-lived reset token, required by step 3.
    const resetToken = jwtUtils.generateResetToken({ userId: user.id });

    return {
      success: true,
      message: "OTP verified successfully",
      resetToken,
    };
  },

  // ----------------------------------------------------------
  // Step 3: user submits the reset token (from step 2) + new password.
  // ----------------------------------------------------------
  async resetPassword(data: any) {
    const validated = resetPasswordSchema.parse(data);

    let decoded;
    try {
      decoded = jwtUtils.verifyResetToken(validated.resetToken);
    } catch (error) {
      // Covers both "expired" and "tampered/wrong type" cases
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
