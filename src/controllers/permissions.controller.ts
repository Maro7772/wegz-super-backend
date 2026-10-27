import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SuperAdminModel } from "../models/SuperAdmin";
import {
  SuperAdminPermissionModel,
  ACTIVE_PERMISSIONS,
  PERMISSIONS,
  buildPermissionsCatalog,
  type Permission,
} from "../models/SuperAdminPermission";
import { BadRequest, NotFound, ForbiddenError } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

// ============================================================================
// Catalog
// ============================================================================

/**
 * GET /api/admin/permissions/catalog
 *
 * ✨ جديد: بيرجع الـ resources مجمّعة مع actions + labels عشان الفرونت
 * يرسم matrix (View / Add / Edit / Delete) بدل flat list.
 *
 * Response shape:
 * {
 *   resources: [
 *     {
 *       key: "clients",
 *       label_en: "Clients",
 *       label_ar: "العملاء",
 *       actions: [
 *         { key: "view",   label_en: "View",   label_ar: "عرض",   permission: "clients:view" },
 *         { key: "add",    label_en: "Add",    label_ar: "إضافة", permission: "clients:add" },
 *         { key: "edit",   label_en: "Edit",   label_ar: "تعديل", permission: "clients:edit" },
 *         { key: "delete", label_en: "Delete", label_ar: "حذف",   permission: "clients:delete" }
 *       ],
 *       permissions: ["clients:view", "clients:add", "clients:edit", "clients:delete"]
 *     },
 *     ...
 *   ],
 *   all_permissions: [...]  // backward compat (flat list)
 * }
 */
export const listPermissionsCatalog = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    SuccessResponse(res, {
      message: "Permissions catalog",
      data: {
        resources: buildPermissionsCatalog(),
        all_permissions: [...ACTIVE_PERMISSIONS],
      },
    });
  },
);

/**
 * alias قديم — نفس الـ handler.
 * عشان أي كود قديم على الفرونت بيستدعي /permissions ما يتكسرش.
 */
export const listAvailablePermissions = listPermissionsCatalog;

// ============================================================================
// Admin permissions
// ============================================================================

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
          ? [...ACTIVE_PERMISSIONS]
          : (permDoc?.permissions ?? []),
      },
    });
  },
);

/**
 * PUT /api/admin/admins/:id/permissions
 *
 * - Validation ضد PERMISSIONS كاملة (مش ACTIVE_PERMISSIONS) عشان
 *   الـ round-trip (fetch → edit → save) ميكسرش لو فيه deprecated permissions
 *   متخزنة على admin.
 * - Root بيتعدل من نفسه بس.
 * - ✨ منع أي admin من تعديل صلاحيات نفسه (privilege escalation guard).
 */
export const updateAdminPermissions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { permissions } = req.body as { permissions?: Permission[] };

    if (!Array.isArray(permissions)) {
      throw new BadRequest("permissions must be an array");
    }

    // ✨ validation ضد PERMISSIONS كاملة (includes deprecated)
    // + إزالة التكرار عشان مفيش نفس الصلاحية متخزنة مرتين
    const unique = [...new Set(permissions)];
    const invalid = unique.filter((p) => !PERMISSIONS.includes(p as any));
    if (invalid.length) {
      throw new BadRequest(`Invalid permissions: ${invalid.join(", ")}`);
    }

    const target = await SuperAdminModel.findById(req.params.id);
    if (!target) throw new NotFound("Admin not found");

    // منع تعديل الـ Root إلا من نفسه
    if (target.is_root && req.admin!.id !== target._id.toString()) {
      throw new ForbiddenError("Cannot modify the root admin permissions");
    }

    // ✨ منع أي admin من تعديل صلاحيات نفسه (privilege escalation)
    if (target._id.toString() === req.admin!.id) {
      throw new ForbiddenError("You cannot modify your own permissions");
    }

    const before = await SuperAdminPermissionModel.findOne({
      admin_id: target._id,
    });

    const updated = await SuperAdminPermissionModel.findOneAndUpdate(
      { admin_id: target._id },
      {
        $set: {
          permissions: unique,
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
        after: unique,
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
