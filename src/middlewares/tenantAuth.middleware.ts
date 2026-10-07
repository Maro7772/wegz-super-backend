import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { TenantApiKeyModel } from "../models/TenantApiKey";
import { UnauthorizedError } from "../utils/errors";

export interface TenantRequest extends Request {
  tenantClientId?: string;
  tenantKeyId?: string;
}

export async function tenantAuth(
  req: TenantRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const raw = (req.headers["x-tenant-api-key"] as string) || "";
    if (!raw) return next(new UnauthorizedError("Missing X-Tenant-Api-Key"));

    const hashed = crypto.createHash("sha256").update(raw).digest("hex");
    const keyDoc = await TenantApiKeyModel.findOne({
      hashedKey: hashed,
      active: true,
    });
    if (!keyDoc)
      return next(new UnauthorizedError("Invalid or revoked API key"));

    keyDoc.last_used_at = new Date();
    await keyDoc.save();

    req.tenantClientId = keyDoc.client_id.toString();
    req.tenantKeyId = keyDoc._id.toString();
    next();
  } catch (err) {
    next(err);
  }
}
