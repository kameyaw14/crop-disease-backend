// middleware/authMiddleware.ts
////@ts-nocheck
import type { Request, Response, NextFunction } from "express";
import { jwtUtils } from "../utils/jwtUtils.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwtUtils.verifyToken(token as string);
    req.user = decoded;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No token → continue as guest
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwtUtils.verifyToken(token as string);
    req.user = decoded;
  } catch (error) {
    // Invalid/expired token → still continue as guest (do not block)
  }

  next();
};
