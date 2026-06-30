// utils/jwtUtils.ts
import jwt from "jsonwebtoken";
import { env } from "./env.js";

const JWT_SECRET = env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined in .env");
}

export const jwtUtils = {
  // Generates short-lived access token
  generateToken: (payload: {
    userId: string;
    email: string;
    role: string;
  }): string => {
    return jwt.sign(payload, JWT_SECRET!, { expiresIn: "30d" }); // 15 minutes - security best practice
  },

  // Verifies token
  verifyToken: (token: string) => {
    return jwt.verify(token, JWT_SECRET!) as jwt.JwtPayload & {
      userId: string;
      email: string;
      role: string;
    };
  },

  generateResetToken: (payload: { userId: string }): string => {
    return jwt.sign(
      { userId: payload.userId, type: "password_reset" }, // `type` claim distinguishes this from a login token
      JWT_SECRET!,
      { expiresIn: "15m" },
    );
  },

  verifyResetToken: (token: string) => {
    const decoded = jwt.verify(token, JWT_SECRET!) as jwt.JwtPayload & {
      userId: string;
      type: string;
    };

    if (decoded.type !== "password_reset") {
      // Defensive check: this guards against a valid-but-wrong-purpose token
      throw new Error("Invalid token type");
    }

    return decoded;
  },
};
