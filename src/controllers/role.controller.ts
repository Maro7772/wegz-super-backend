import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { RoleModel, ROLE_STATUSES, type RoleStatus } from "../models/Role";
import { SuperAdminModel } from "../models/SuperAdmin";
import { SuperAdminPermissionModel } from "../models/SuperAdminPermission";
import {
  PERMISSIONS,
  type Permission,
} from "../models/SuperAdminPermission";
import { BadRequest, Conflict, ForbiddenError, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

// ============================================================================
// Helpers
// ============================================================================

/** "Cashier Role" → "cashier_role" */
function normalizeRoleName(name: string): string {
  return String(name).trim().toLowerCase().replace(/\s+/g, "_");
}

/** التحقق من صلاحيات الـ Role + منع الـ privilege escalation */
function sanitizePermissions(
  input: unknown,
  req: AuthRequest,
): Permission[] {
  if (!Array.isArray(input)) {
    throw new BadRequest("permissions must be an array");
  }

  const unique = [...new Set(input as Permission[])];
  const invalid = unique.filter((p) => !PERMISSIONS.includes(p as any));
  if (invalid.length) {
    throw new BadRequest(`Invalid permissions: ${invalid.join(", ")}`);
  }

  // أي أدمن غير root مايقدرش يدّي صلاحيات هو نفسه مش معاه
  if (!req.admin!.is_root) {
    const overreach = unique.filter(
      (p) => !req.admin!.permissions.includes(p),
    );
    if (overreach.length) {
      throw new ForbiddenError(
        `You cannot grant permissions you do not have: ${overreach.join(", ")}`,
      );
    }
  }

  return unique;
}

/**
 * غير الـ root مايقدرش يعدّل/يحذف Role فيه صلاحيات أعلى منه
 * (حماية من إنه يرفع نفسه أو غيره بشكل غير مباشر).
 */
function assertCanManageRole(role: any, req: AuthRequest) {
  if (role.is_system && !req.admin!.is_root) {
    throw new ForbiddenError("System roles can only be modified by the root");
  }
  if (!req.admin!.is_root) {
    const overreach = (role.permissions as Permission[]).filter(
      (p) => !req.admin!.permissions.includes(p),
    );
    if (overreach.length) {
      throw new ForbiddenError(
        "This role contains permissions you do not have",
      );
    }
  }
}

function toRoleDTO(role: any, adminsCount = 0) {
  return {
    id: role._id,
    name: role.name,
    label: role.label,
    label_ar: role.label_ar ?? null,
    description: role.description ?? null,
    permissions: role.permissions ?? [],
    permissions_count: (role.permissions ?? []).length,
    status: role.status,
    is_system: role.is_system,
    admins_count: adminsCount,
    created_at: role.createdAt,
    updated_at: role.updatedAt,
  };
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * GET /api/admin/roles
 * ?status=active|inactive  ?q=بحث في name/label
 */
export const listRoles = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, q } = req.query as { status?: string; q?: string };

    const filter: Record<string, unknown> = {};
    if (status) {
      if (!ROLE_STATUSES.includes(status as RoleStatus)) {
        throw new BadRequest(`status must be one of: ${ROLE_STATUSES.join(", ")}`);
      }
      filter.status = status;
    }
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { label: { $regex: q, $options: "i" } },
        { label_ar: { $regex: q, $options: "i" } },
      ];
    }

    const roles = await RoleModel.find(filter).sort({ is_system: -1, name: 1 });

    const counts = await SuperAdminModel.aggregate([
      { $match: { role_id: { $in: roles.map((r) => r._id) } } },
      { $group: { _id: "$role_id", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((c) => [String(c._id), c.count as number]),
    );

    SuccessResponse(res, {
      message: "Roles retrieved",
      data: {
        roles: roles.map((r) =>
          toRoleDTO(r, countMap.get(r._id.toString()) ?? 0),
        ),
      },
    });
  },
);

/**
 * GET /api/admin/roles/:id
 * بيرجع الـ role + الأدمنز اللي عليه.
 */
export const getRoleById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const role = await RoleModel.findById(req.params.id);
    if (!role) throw new NotFound("Role not found");

    const admins = await SuperAdminModel.find({ role_id: role._id }).select(
      "name email status",
    );

    SuccessResponse(res, {
      message: "Role retrieved",
      data: {
        role: toRoleDTO(role, admins.length),
        admins: admins.map((a) => ({
          id: a._id,
          name: a.name,
          email: a.email,
          status: a.status,
        })),
      },
    });
  },
);

/**
 * POST /api/admin/roles
 * body: { name, label?, label_ar?, description?, permissions: string[], status? }
 */
export const createRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, label, label_ar, description, permissions, status } =
      req.body as {
        name?: string;
        label?: string;
        label_ar?: string;
        description?: string;
        permissions?: unknown;
        status?: RoleStatus;
      };

    if (!name || !String(name).trim()) {
      throw new BadRequest("name is required");
    }

    const normalized = normalizeRoleName(name);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
      throw new BadRequest(
        "name may only contain letters, numbers, dashes and underscores",
      );
    }

    const exists = await RoleModel.findOne({ name: normalized });
    if (exists) throw new Conflict("Role name already in use");

    if (status && !ROLE_STATUSES.includes(status)) {
      throw new BadRequest(`status must be one of: ${ROLE_STATUSES.join(", ")}`);
    }

    const perms = sanitizePermissions(permissions ?? [], req);

    const role = await RoleModel.create({
      name: normalized,
      label: label?.trim() || normalized,
      label_ar: label_ar?.trim(),
      description: description?.trim(),
      permissions: perms,
      status: status ?? "active",
      is_system: false,
      created_by: req.admin!.id,
      updated_by: req.admin!.id,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "role.create",
      targetType: "Role",
      targetId: role._id,
      metadata: { name: role.name, permissions: role.permissions },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      { message: "Role created", data: { role: toRoleDTO(role) } },
      201,
    );
  },
);

/**
 * PATCH /api/admin/roles/:id
 * كل الحقوق اختيارية. لو عدّلت permissions، التغيير بيتطبق فورًا
 * على كل الأدمنز اللي عليهم الـ role (Live).
 */
export const updateRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, label, label_ar, description, permissions, status } =
      req.body as {
        name?: string;
        label?: string;
        label_ar?: string;
        description?: string;
        permissions?: unknown;
        status?: RoleStatus;
      };

    const role = await RoleModel.findById(req.params.id);
    if (!role) throw new NotFound("Role not found");

    assertCanManageRole(role, req);

    if (name !== undefined) {
      const normalized = normalizeRoleName(name);
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
        throw new BadRequest(
          "name may only contain letters, numbers, dashes and underscores",
        );
      }
      if (normalized !== role.name) {
        const exists = await RoleModel.findOne({ name: normalized });
        if (exists) throw new Conflict("Role name already in use");
        role.name = normalized;
      }
    }

    if (label !== undefined) role.label = label.trim();
    if (label_ar !== undefined) role.label_ar = label_ar?.trim();
    if (description !== undefined) role.description = description?.trim();

    if (status !== undefined) {
      if (!ROLE_STATUSES.includes(status)) {
        throw new BadRequest(
          `status must be one of: ${ROLE_STATUSES.join(", ")}`,
        );
      }
      role.status = status;
    }

    if (permissions !== undefined) {
      role.permissions = sanitizePermissions(permissions, req);
    }

    role.updated_by = new mongoose.Types.ObjectId(req.admin!.id);
    await role.save();

    const adminsCount = await SuperAdminModel.countDocuments({
      role_id: role._id,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "role.update",
      targetType: "Role",
      targetId: role._id,
      metadata: {
        changed: Object.keys(req.body),
        permissions: role.permissions,
        affected_admins: adminsCount,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Role updated",
      data: { role: toRoleDTO(role, adminsCount) },
    });
  },
);

/**
 * DELETE /api/admin/roles/:id
 * - ممنوع لو فيه أدمنز عليه، إلا لو ?force=true
 *   (في الحالة دي بنفصلهم وبنفضّي صلاحياتهم الفردية).
 */
export const deleteRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const role = await RoleModel.findById(req.params.id);
    if (!role) throw new NotFound("Role not found");

    assertCanManageRole(role, req);

    const force = String(req.query.force) === "true";
    const assigned = await SuperAdminModel.find({ role_id: role._id }).select(
      "_id email",
    );

    if (assigned.length && !force) {
      throw new Conflict(
        `Role is assigned to ${assigned.length} admin(s). ` +
          `Move them to another role first, or use force=true.`,
      );
    }

    if (assigned.length) {
      await SuperAdminModel.updateMany(
        { role_id: role._id },
        { $set: { role_id: null } },
      );
      await SuperAdminPermissionModel.updateMany(
        { admin_id: { $in: assigned.map((a) => a._id) } },
        { $set: { permissions: [] } },
      );
    }

    await RoleModel.deleteOne({ _id: role._id });

    await logAudit({
      adminId: req.admin!.id,
      action: "role.delete",
      targetType: "Role",
      targetId: role._id,
      metadata: {
        name: role.name,
        forced: force,
        detached_admins: assigned.map((a) => a.email),
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Role deleted",
      data: { detached_admins: assigned.length },
    });
  },
);
