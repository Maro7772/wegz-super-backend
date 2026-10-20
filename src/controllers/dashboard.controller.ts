import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { CategoryModel } from "../models/Category";
import { PaymentModel } from "../models/Payment";
import { SaleModel } from "../models/Sale";
import { SuperAdminModel } from "../models/SuperAdmin";
import { SuccessResponse } from "../utils/response";
import { env } from "../config/env";

/**
 * GET /api/admin/dashboard
 */
export const getDashboardStats = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const now = new Date();
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);

    const [
      totalClients,
      activeClients,
      suspendedClients,
      pendingClients,
      failedProvisioning,
      totalAdmins,
      totalCategories,
      revenue30,
      pendingPayments,
      sales30,
      recentClients,
    ] = await Promise.all([
      ClientModel.countDocuments(),
      ClientModel.countDocuments({ status: "active" }),
      ClientModel.countDocuments({ status: "suspended" }),
      ClientModel.countDocuments({ status: "pending" }),
      ClientModel.countDocuments({ provisioning_status: "failed" }),
      SuperAdminModel.countDocuments(),
      CategoryModel.countDocuments(),
      PaymentModel.aggregate([
        { $match: { status: "approve", date: { $gte: last30 } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      PaymentModel.aggregate([
        { $match: { status: "pending" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
      SaleModel.aggregate([
        { $match: { sale_date: { $gte: last30 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$total" },
          },
        },
      ]),
      ClientModel.find()
        .select("company_name email subdomain status createdAt")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    SuccessResponse(res, {
      message: "Dashboard stats retrieved",
      data: {
        clients: {
          total: totalClients,
          active: activeClients,
          suspended: suspendedClients,
          pending: pendingClients,
          failed_provisioning: failedProvisioning,
        },
        admins: { total: totalAdmins },
        categories: { total: totalCategories },
        finance: {
          currency: env.CURRENCY,
          revenue_last_30_days: revenue30[0]?.total ?? 0,
          pending_payments: pendingPayments[0] ?? { count: 0, total: 0 },
        },
        sales_last_30_days: sales30[0] ?? { count: 0, total: 0 },
        recent_clients: recentClients,
        generated_at: now,
      },
    });
  },
);
