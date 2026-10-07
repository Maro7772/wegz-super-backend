import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SuperAdminModel } from "../models/SuperAdmin";
import { SuperAdminPermissionModel } from "../models/SuperAdminPermission";
import {
  BadRequest,
  NotFound,
  Conflict,
  ForbiddenError,
} from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

/**
 * POST /api/admin/admins
 * ينشئ Super Admin جديد (بدون صلاحيات — تُضاف لاحقًا عبر Permissions endpoint).
 * Root فقط.
 */
export const createSuperAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || !email || !password) {
      throw new BadRequest("name, email, and password are required");
    }

    const exists = await SuperAdminModel.findOne({
      email: email.toLowerCase(),
    });
    if (exists) throw new Conflict("Email already in use");

    const admin = await SuperAdminModel.create({
      name,
      email,
      password,
      is_root: false,
      status: "active",
    });

    // إنشاء صف صلاحيات فاضي (مبدئيًا)
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
      metadata: { email: admin.email, name: admin.name },
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

    SuccessResponse(res, {
      message: "Super Admins retrieved",
      data: {
        admins: admins.map((a) => ({
          id: a._id,
          name: a.name,
          email: a.email,
          is_root: a.is_root,
          status: a.status,
          permissions: permMap.get(a._id.toString()) ?? [],
          createdAt: a.createdAt,
        })),
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

    SuccessResponse(res, {
      message: "Super Admin retrieved",
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          is_root: admin.is_root,
          status: admin.status,
          permissions: permDoc?.permissions ?? [],
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
    if (status && ["active", "inactive"].includes(status))
      admin.status = status;
    if (password) admin.password = password; // سيتشفر في pre-save

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
