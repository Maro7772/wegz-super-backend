import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SuperAdminModel } from "../models/SuperAdmin";
import {
  SuperAdminPermissionModel,
  PERMISSIONS,
  type Permission,
} from "../models/SuperAdminPermission";
import { BadRequest, NotFound, ForbiddenError } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

/**
 * GET /api/admin/permissions/catalog
 */
export const listAvailablePermissions = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    SuccessResponse(res, {
      message: "Available permissions",
      data: { permissions: [...PERMISSIONS] },
    });
  },
);

/**
 * GET /api/admin/admins/:id/permissions
 */
export const getAdminPermissions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const admin = await SuperAdminModel.findById(req.params.id);
    if (!admin) throw new NotFound("Admin not found");

    const permDoc = await SuperAdminPermissionModel.findOne({
      admin_id: admin._id,
    });

    SuccessResponse(res, {
      message: "Permissions retrieved",
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          is_root: admin.is_root,
        },
        permissions: admin.is_root
          ? [...PERMISSIONS]
          : (permDoc?.permissions ?? []),
      },
    });
  },
);

/**
 * PUT /api/admin/admins/:id/permissions
 * Root فقط (يُفرض عبر middleware).
 */
export const updateAdminPermissions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { permissions } = req.body as { permissions?: Permission[] };

    if (!Array.isArray(permissions)) {
      throw new BadRequest("permissions must be an array");
    }

    const invalid = permissions.filter((p) => !PERMISSIONS.includes(p as any));
    if (invalid.length) {
      throw new BadRequest(`Invalid permissions: ${invalid.join(", ")}`);
    }

    const target = await SuperAdminModel.findById(req.params.id);
    if (!target) throw new NotFound("Admin not found");

    // منع تعديل الـ Root إلا من نفسه
    if (target.is_root && req.admin!.id !== target._id.toString()) {
      throw new ForbiddenError("Cannot modify the root admin permissions");
    }

    const before = await SuperAdminPermissionModel.findOne({
      admin_id: target._id,
    });

    const updated = await SuperAdminPermissionModel.findOneAndUpdate(
      { admin_id: target._id },
      {
        $set: {
          permissions,
          updated_by: req.admin!.id,
        },
      },
      { upsert: true, new: true },
    );

    await logAudit({
      adminId: req.admin!.id,
      action: "admin.permissions.update",
      targetType: "SuperAdmin",
      targetId: target._id,
      metadata: {
        before: before?.permissions ?? [],
        after: permissions,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Permissions updated",
      data: {
        admin_id: target._id,
        permissions: updated.permissions,
      },
    });
  },
);
