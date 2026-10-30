import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SuperAdminModel } from "../models/SuperAdmin";
import { RoleModel } from "../models/Role";
import {
  SuperAdminPermissionModel,
  ACTIVE_PERMISSIONS,
} from "../models/SuperAdminPermission";
import {
  BadRequest,
  NotFound,
  Conflict,
  ForbiddenError,
} from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

// ============================================================================
// Admins CRUD
// ============================================================================

/**
 * POST /api/admin/admins
 * ينشئ Super Admin جديد.
 * - لو بعت role_id: الأدمن بياخد صلاحيات الـ role (Live).
 * - لو مبعتش: بيبدأ بدون صلاحيات وتُضاف لاحقًا عبر Permissions endpoint.
 */
export const createSuperAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, email, password, role_id } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role_id?: string | null;
    };

    if (!name || !email || !password) {
      throw new BadRequest("name, email, and password are required");
    }

    if (String(password).length < 6) {
      throw new BadRequest("password must be at least 6 characters");
    }

    const exists = await SuperAdminModel.findOne({
      email: email.toLowerCase(),
    });
    if (exists) throw new Conflict("Email already in use");

    // ✨ التحقق من الـ role لو اتبعت
    let role = null;
    if (role_id) {
      if (!mongoose.isValidObjectId(role_id)) {
        throw new BadRequest("Invalid role_id");
      }
      role = await RoleModel.findById(role_id);
      if (!role) throw new NotFound("Role not found");
      if (role.status !== "active") {
        throw new BadRequest("Cannot assign an inactive role");
      }

      // حماية من تصعيد الصلاحيات
      if (!req.admin!.is_root) {
        const overreach = role.permissions.filter(
          (p) => !req.admin!.permissions.includes(p),
        );
        if (overreach.length) {
          throw new ForbiddenError(
            `You cannot assign a role with permissions you do not have: ${overreach.join(", ")}`,
          );
        }
      }
    }

    const admin = await SuperAdminModel.create({
      name,
      email,
      password,
      is_root: false,
      role_id: role?._id ?? null,
      status: "active",
    });

    // إنشاء صف صلاحيات فاضي (للتوافق مع الأدمنز القديمة)
    await SuperAdminPermissionModel.create({
      admin_id: admin._id,
      permissions: [],
      updated_by: req.admin!.id,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "admin.create",
      targetType: "SuperAdmin",
      targetId: admin._id,
      metadata: {
        email: admin.email,
        name: admin.name,
        role: role?.name ?? null,
      },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      {
        message: "Super Admin created",
        data: {
          admin: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            is_root: admin.is_root,
            status: admin.status,
            role: role
              ? { id: role._id, name: role.name, label: role.label }
              : null,
            permissions: role ? role.permissions : [],
            role_id: role?._id ?? null,
          },
        },
      },
      201,
    );
  },
);

/**
 * GET /api/admin/admins
 */
export const listSuperAdmins = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const admins = await SuperAdminModel.find().sort({ createdAt: -1 });

    const perms = await SuperAdminPermissionModel.find({
      admin_id: { $in: admins.map((a) => a._id) },
    });
    const permMap = new Map(
      perms.map((p) => [p.admin_id.toString(), p.permissions]),
    );

    // ✨ نجيب الـ roles مرة واحدة بدل query لكل أدمن
    const roleIds = admins
      .map((a) => a.role_id)
      .filter((id): id is any => Boolean(id));
    const roles = roleIds.length
      ? await RoleModel.find({ _id: { $in: roleIds } })
      : [];
    const roleMap = new Map(roles.map((r) => [r._id.toString(), r]));

    SuccessResponse(res, {
      message: "Super Admins retrieved",
      data: {
        admins: admins.map((a) => {
          const role = a.role_id
            ? roleMap.get(a.role_id.toString())
            : undefined;

          return {
            id: a._id,
            name: a.name,
            email: a.email,
            is_root: a.is_root,
            status: a.status,
            role_id: a.role_id ?? null,
            role: role
              ? {
                  id: role._id,
                  name: role.name,
                  label: role.label,
                  status: role.status,
                }
              : null,
            permissions: a.is_root
              ? [...ACTIVE_PERMISSIONS]
              : role
                ? role.permissions
                : (permMap.get(a._id.toString()) ?? []),
            createdAt: a.createdAt,
          };
        }),
      },
    });
  },
);

/**
 * GET /api/admin/admins/:id
 */
export const getSuperAdminById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const admin = await SuperAdminModel.findById(req.params.id);
    if (!admin) throw new NotFound("Super Admin not found");

    const permDoc = await SuperAdminPermissionModel.findOne({
      admin_id: admin._id,
    });

    const role = admin.role_id
      ? await RoleModel.findById(admin.role_id)
      : null;

    SuccessResponse(res, {
      message: "Super Admin retrieved",
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          is_root: admin.is_root,
          status: admin.status,
          role_id: admin.role_id ?? null,
          role: role
            ? {
                id: role._id,
                name: role.name,
                label: role.label,
                status: role.status,
              }
            : null,
          permissions: admin.is_root
            ? [...ACTIVE_PERMISSIONS]
            : role
              ? role.permissions
              : (permDoc?.permissions ?? []),
        },
      },
    });
  },
);

/**
 * PATCH /api/admin/admins/:id
 * يعدّل name/email/status/password.
 * لا يعدّل is_root ولا permissions.
 */
export const updateSuperAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, email, status, password } = req.body as any;

    if (req.body?.role_id !== undefined) {
      throw new BadRequest(
        "Use PUT /api/admin/admins/:id/role to change the role",
      );
    }

    const admin = await SuperAdminModel.findById(req.params.id).select(
      "+password",
    );
    if (!admin) throw new NotFound("Super Admin not found");

    // منع تعديل الـ Root من أي حد تاني
    if (admin.is_root && req.admin!.id !== admin._id.toString()) {
      throw new ForbiddenError("Cannot modify the root admin");
    }

    if (email && email.toLowerCase() !== admin.email) {
      const exists = await SuperAdminModel.findOne({
        email: email.toLowerCase(),
      });
      if (exists) throw new Conflict("Email already in use");
      admin.email = email.toLowerCase();
    }

    if (name) admin.name = name;
    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        throw new BadRequest("status must be active or inactive");
      }
      admin.status = status;
    }
    if (password) {
      if (String(password).length < 6) {
        throw new BadRequest("password must be at least 6 characters");
      }
      admin.password = password; // سيتشفر في pre-save
    }

    await admin.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "admin.update",
      targetType: "SuperAdmin",
      targetId: admin._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Super Admin updated",
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          is_root: admin.is_root,
          status: admin.status,
        },
      },
    });
  },
);

/**
 * DELETE /api/admin/admins/:id
 * Root فقط، ومينفعش يمسح نفسه ولا يمسح root.
 */
export const deleteSuperAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const admin = await SuperAdminModel.findById(req.params.id);
    if (!admin) throw new NotFound("Super Admin not found");

    if (admin.is_root) throw new ForbiddenError("Cannot delete the root admin");
    if (admin._id.toString() === req.admin!.id) {
      throw new ForbiddenError("Cannot delete your own account");
    }

    await SuperAdminPermissionModel.deleteOne({ admin_id: admin._id });
    await SuperAdminModel.findByIdAndDelete(admin._id);

    await logAudit({
      adminId: req.admin!.id,
      action: "admin.delete",
      targetType: "SuperAdmin",
      targetId: admin._id,
      metadata: { email: admin.email },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Super Admin deleted" });
  },
);

// ============================================================================
// Role assignment
// ============================================================================

/**
 * PUT /api/admin/admins/:id/role
 * body: { role_id: string | null }
 *
 * - role_id = null → فصل الـ role (الأدمن بيبقى بدون صلاحيات).
 * - الصلاحيات بتتحسب Live من الـ role، فمفيش نسخ هنا.
 * - ممنوع أي أدمن يغيّر role نفسه (منع تصعيد الصلاحيات).
 */
export const assignAdminRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { role_id } = req.body as { role_id?: string | null };

    if (role_id === undefined) {
      throw new BadRequest("role_id is required (use null to remove the role)");
    }

    const target = await SuperAdminModel.findById(req.params.id);
    if (!target) throw new NotFound("Admin not found");
    if (target.is_root) {
      throw new ForbiddenError("The root admin does not use roles");
    }
    if (target._id.toString() === req.admin!.id) {
      throw new ForbiddenError("You cannot change your own role");
    }

    let role = null;
    if (role_id !== null) {
      if (!mongoose.isValidObjectId(role_id)) {
        throw new BadRequest("Invalid role_id");
      }
      role = await RoleModel.findById(role_id);
      if (!role) throw new NotFound("Role not found");
      if (role.status !== "active") {
        throw new BadRequest("Cannot assign an inactive role");
      }

      // حماية من تصعيد الصلاحيات للأدمنز غير الـ root
      if (!req.admin!.is_root) {
        const overreach = role.permissions.filter(
          (p) => !req.admin!.permissions.includes(p),
        );
        if (overreach.length) {
          throw new ForbiddenError(
            `You cannot assign a role with permissions you do not have: ${overreach.join(", ")}`,
          );
        }
      }
    }

    const before = await SuperAdminModel.findById(target._id).select("role_id");

    target.role_id = role?._id ?? null;
    await target.save();

    // الصلاحيات الفردية القديمة بتتشال لما الأدمن يبقى على role
    await SuperAdminPermissionModel.findOneAndUpdate(
      { admin_id: target._id },
      {
        $set: {
          permissions: [],
          updated_by: req.admin!.id,
        },
      },
      { upsert: true, new: true },
    );

    await logAudit({
      adminId: req.admin!.id,
      action: "admin.role.assign",
      targetType: "SuperAdmin",
      targetId: target._id,
      metadata: {
        before: before?.role_id ?? null,
        after: role?._id ?? null,
        role_name: role?.name ?? null,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: role ? "Role assigned" : "Role removed",
      data: {
        admin_id: target._id,
        role_id: target.role_id ?? null,
        role: role
          ? { id: role._id, name: role.name, label: role.label }
          : null,
        permissions: role ? role.permissions : [],
      },
    });
  },
);
