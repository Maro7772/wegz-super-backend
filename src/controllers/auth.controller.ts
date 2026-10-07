import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { SuperAdminModel } from "../models/SuperAdmin";
import { signAdminToken } from "../utils/jwt.util";
import { UnauthorizedError, BadRequest } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

/**
 * POST /api/auth/login
 * body: { email, password }
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new BadRequest("Email and password are required");
  }

  const admin = await SuperAdminModel.findOne({ email }).select("+password");
  if (!admin) throw new UnauthorizedError("Invalid credentials");

  if (admin.status !== "active") {
    throw new UnauthorizedError("Account is not active");
  }

  const ok = await admin.comparePassword(password);
  if (!ok) throw new UnauthorizedError("Invalid credentials");

  const token = signAdminToken(admin._id.toString());

  await logAudit({
    adminId: admin._id,
    action: "auth.login",
    targetType: "SuperAdmin",
    targetId: admin._id,
    ip: req.ip,
  });

  SuccessResponse(res, {
    message: "Login successful",
    data: {
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        is_root: admin.is_root,
      },
    },
  });
});

/**
 * GET /api/auth/me
 * (محمي بـ authenticate)
 */
export const me = asyncHandler(async (req: any, res: Response) => {
  SuccessResponse(res, {
    message: "Current admin",
    data: {
      admin: {
        id: req.admin.id,
        name: req.admin.name,
        email: req.admin.email,
        is_root: req.admin.is_root,
        permissions: req.admin.permissions,
      },
    },
  });
});
