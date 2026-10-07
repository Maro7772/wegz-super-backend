import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";
import { ForbiddenError } from "../utils/errors";
import type { Permission } from "../models/SuperAdminPermission";

export function requirePermission(...required: Permission[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new ForbiddenError("Not authenticated"));
    if (req.admin.is_root) return next();

    const missing = required.filter((p) => !req.admin!.permissions.includes(p));
    if (missing.length) {
      return next(
        new ForbiddenError(`Missing permissions: ${missing.join(", ")}`),
      );
    }
    next();
  };
}
