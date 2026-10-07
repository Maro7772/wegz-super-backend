import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../utils/errors";
import { SuperAdminModel } from "../models/SuperAdmin";
import { SuperAdminPermissionModel } from "../models/SuperAdminPermission";
import type { Permission } from "../models/SuperAdminPermission";

export interface AuthRequest extends Request {
  admin?: {
    id: string;
    is_root: boolean;
    email: string;
    name: string;
    permissions: Permission[];
  };
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError("Missing or invalid Authorization header"),
    );
  }

  try {
    const decoded = jwt.verify(header.slice(7).trim(), env.JWT_SECRET) as any;

    const admin = await SuperAdminModel.findById(decoded.sub);
    if (!admin || admin.status !== "active") {
      return next(new UnauthorizedError("Admin not found or inactive"));
    }

    // الـ Root عنده كل الصلاحيات دائمًا
    let permissions: Permission[] = [];
    if (admin.is_root) {
      permissions = (
        await import("../models/SuperAdminPermission")
      ).PERMISSIONS.slice() as any;
    } else {
      const permDoc = await SuperAdminPermissionModel.findOne({
        admin_id: admin._id,
      });
      permissions = (permDoc?.permissions ?? []) as Permission[];
    }

    req.admin = {
      id: admin._id.toString(),
      is_root: admin.is_root,
      email: admin.email,
      name: admin.name,
      permissions,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}
