import type { Response } from "express";

export function SuccessResponse(
  res: Response,
  payload: Record<string, unknown> & { message: string },
  statusCode = 200,
) {
  return res.status(statusCode).json({ success: true, ...payload });
}

export function ErrorResponse(
  res: Response,
  message: string,
  statusCode = 500,
  extra?: Record<string, unknown>,
) {
  return res
    .status(statusCode)
    .json({ success: false, message, ...(extra ?? {}) });
}
