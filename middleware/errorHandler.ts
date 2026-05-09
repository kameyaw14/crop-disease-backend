// middleware/errorHandler.ts

import type { NextFunction, Request, Response } from "express";

// NEW ADDITION: Centralized error middleware for secure responses
// Never expose internal errors or model details (security best practice)
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error("Error:", err.message); // Log for debugging only
  res.status(500).json({
    success: false,
    message:
      "An error occurred while processing your request. Please try again.", // Secure generic message
  });
};
