import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { AuditLogModel } from "../models/AuditLog";
import { SuccessResponse } from "../utils/response";

/**
 * GET /api/admin/audit
 * query: admin_id, action, target_type, target_id, from, to, page, limit
 */
export const listAuditLogs = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      admin_id,
      action,
      target_type,
      target_id,
      from,
      to,
      page = "1",
      limit = "50",
    } = req.query as any;

    const filter: any = {};
    if (admin_id) filter.admin_id = admin_id;
    if (action) filter.action = new RegExp(`^${action}`, "i");
    if (target_type) filter.target_type = target_type;
    if (target_id) filter.target_id = target_id;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("admin_id", "name email"),
      AuditLogModel.countDocuments(filter),
    ]);

    SuccessResponse(res, {
      message: "Audit logs retrieved",
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  },
);

/**
 * GET /api/admin/audit/stats
 */
export const auditStats = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const byAction = await AuditLogModel.aggregate([
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    const total = await AuditLogModel.countDocuments();

    const last24h = await AuditLogModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    SuccessResponse(res, {
      message: "Audit stats",
      data: { total, last24h, byAction },
    });
  },
);
