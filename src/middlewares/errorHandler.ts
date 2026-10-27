import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";

/**
 * ترجمة أخطاء Mongoose / body-parser لأكواد HTTP مفهومة.
 * قبل كده أي ObjectId غلط في الـ URL أو أي duplicate key كان بيرجع 500
 * برسالة داخلية، والفرونت ما كانش يعرف إن المشكلة في الـ input نفسه.
 */
function normalizeError(err: unknown): { statusCode: number; message: string } {
  const e = err as any;

  if (e instanceof AppError) {
    return { statusCode: e.statusCode, message: e.message };
  }

  // Mongoose: ObjectId / رقم غلط في الـ query
  if (e?.name === "CastError") {
    const path = e.path ? ` (${e.path})` : "";
    return {
      statusCode: 400,
      message: `Invalid value${path}: ${e.value ?? ""}`.trim(),
    };
  }

  // Mongoose: validation (enum / required / min ...)
  if (e?.name === "ValidationError" && e.errors) {
    const details = Object.values(e.errors)
      .map((item: any) => item?.message)
      .filter(Boolean)
      .join("; ");
    return {
      statusCode: 400,
      message: details || e.message || "Validation failed",
    };
  }

  // MongoDB: duplicate key
  if (e?.code === 11000) {
    const fields = Object.keys(e.keyPattern ?? e.keyValue ?? {});
    return {
      statusCode: 409,
      message: fields.length
        ? `Duplicate value for: ${fields.join(", ")}`
        : "Duplicate value",
    };
  }

  // body-parser: JSON غير صالح
  if (e?.type === "entity.parse.failed" || e instanceof SyntaxError) {
    return { statusCode: 400, message: "Invalid JSON body" };
  }

  // Multer / حجم الملف
  if (e?.type === "entity.too.large") {
    return { statusCode: 413, message: "Request body is too large" };
  }

  return {
    statusCode: 500,
    message: e?.message ?? "Internal server error",
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const { statusCode, message } = normalizeError(err);

  if (statusCode >= 500) console.error("❌ Unhandled error:", err);

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && {
      stack: (err as any)?.stack,
    }),
  });
}
