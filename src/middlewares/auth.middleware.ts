import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../utils/errors";
import { SuperAdminModel } from "../models/SuperAdmin";
import {
  SuperAdminPermissionModel,
  ACTIVE_PERMISSIONS,
  type Permission,
} from "../models/SuperAdminPermission";
import { RoleModel } from "../models/Role";

export interface AuthRequest extends Request {
  admin?: {
    id: string;
    is_root: boolean;
    email: string;
    name: string;
    role: {
      id: string;
      name: string;
      label: string;
      status: string;
    } | null;
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

    let permissions: Permission[] = [];
    let roleInfo: NonNullable<AuthRequest["admin"]>["role"] = null;

    if (admin.is_root) {
      // الـ Root عنده كل الصلاحيات النشطة دائمًا
      permissions = ACTIVE_PERMISSIONS.slice() as Permission[];
    } else if (admin.role_id) {
      // ✨ الصلاحيات بتتحسب LIVE من الـ Role
      // أي تعديل في الـ Role بيتطبق على كل الأعضاء فورًا.
      const role = await RoleModel.findById(admin.role_id);

      if (!role || role.status !== "active") {
        return next(
          new UnauthorizedError(
            "Assigned role not found or inactive. Contact the root admin.",
          ),
        );
      }

      permissions = role.permissions.slice() as Permission[];
      roleInfo = {
        id: role._id.toString(),
        name: role.name,
        label: role.label,
        status: role.status,
      };
    } else {
      // توافق قديم: أدمنز معندهم Role لسه على الصلاحيات الفردية
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
      role: roleInfo,
      permissions,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}
