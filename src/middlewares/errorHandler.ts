import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const e = err as any;
  const statusCode = e instanceof AppError ? e.statusCode : 500;
  const message = e?.message ?? "Internal server error";

  if (statusCode >= 500) console.error("❌ Unhandled error:", e);

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: e?.stack }),
  });
}
