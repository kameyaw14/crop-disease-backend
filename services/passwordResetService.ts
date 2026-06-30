// services/passwordResetService.ts
// @ts-nocheck

import bcrypt from "bcrypt";
import { prisma } from "../config/connectDb.js";
import { jwtUtils } from "../utils/jwtUtils.js";
import { normalizePhoneNumber } from "../utils/phoneUtils.js";
import {
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
} from "../schema/authSchema.js";

// How long an OTP stays valid after it is issued
const OTP_EXPIRY_MINUTES = 10;

export const passwordResetService = {
  // ----------------------------------------------------------
  // Step 1: user submits their phone number.
  // Doubles as "resend OTP" — calling this again invalidates all
  // previous unused OTPs and issues a fresh one.
  // ----------------------------------------------------------
  async forgotPassword(data: any) {
    const validated = forgotPasswordSchema.parse(data);

    // normalizePhoneNumber now returns +233XXXXXXXXX (international),
    // which matches exactly how phoneNumber is stored in the DB.
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

    // SECURITY: return the same success shape whether or not the user
    // exists, so this endpoint cannot be used to enumerate registered numbers.
    if (!user) {
      return {
        success: true,
        message: "If this number is registered, an OTP has been sent.",
        // message: "No User",
      };
    }

    // Generate a 6-digit numeric OTP, zero-padded (e.g. "048213")
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP before storing — same pattern as password hashing.
    // A database leak will not expose usable raw OTPs.
    const otpHash = await bcrypt.hash(otp, 12);

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate all previous unused OTPs for this user so only the
    // newest one can ever succeed.
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

    // TODO: replace this with an Arkesel SMS API call.
    // OTP is logged to server console only during development.
    console.log(
      `📱 OTP for ${normalizedPhone}: ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`,
    );

    return {
      success: true,
      message: "If this number is registered, an OTP has been sent.",
    };
  },

  // ----------------------------------------------------------
  // Step 2: user submits phone number + the 6-digit OTP they received.
  // On success, marks the user as verified and returns a short-lived
  // reset token that step 3 requires.
  // ----------------------------------------------------------
  async verifyResetOtp(data: any) {
    const validated = verifyResetOtpSchema.parse(data);

    // Must normalize here too, for the same reason as step 1
    const normalizedPhone = normalizePhoneNumber(validated.phoneNumber);

    if (!normalizedPhone) {
      throw new Error("Invalid phone number format");
    }

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });

    // Generic error — intentionally doesn't confirm whether the number exists
    if (!user) {
      throw new Error("Invalid or expired OTP");
    }

    // Find the most recent unused, non-expired OTP record for this user
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

    // Compare the submitted raw OTP against the stored hash
    const isMatch = await bcrypt.compare(validated.otp, otpRecord.otpHash);

    if (!isMatch) {
      throw new Error("Invalid or expired OTP");
    }

    // Mark this OTP record as used — prevents replay attacks where the
    // same OTP code is submitted a second time after a successful verify.
    // Also flip isEmailVerified to true since the user has now proven
    // ownership of their registered contact number.
    // `Promise.all` runs both writes in parallel since they are independent.
    await Promise.all([
      prisma.passwordResetOTP.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true }, // UPDATED: mark account as verified on successful OTP
      }),
    ]);

    // Issue the short-lived reset token required by step 3
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
      // Covers both expired tokens and tampered/wrong-type tokens
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
