import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { SubscriptionModel } from "../models/Subscription";
import { PackageModel } from "../models/Package";
import { SuperAdminModel } from "../models/SuperAdmin";
import { SuccessResponse } from "../utils/response";

/**
 * GET /api/admin/dashboard
 */
export const getDashboardStats = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      totalClients,
      activeClients,
      suspendedClients,
      pendingClients,
      failedProvisioning,
      totalPackages,
      activePackages,
      totalAdmins,
      totalSubscriptions,
      activeSubscriptions,
      expiringSoon,
      recentClients,
    ] = await Promise.all([
      ClientModel.countDocuments(),
      ClientModel.countDocuments({ status: "active" }),
      ClientModel.countDocuments({ status: "suspended" }),
      ClientModel.countDocuments({ status: "pending" }),
      ClientModel.countDocuments({ provisioning_status: "failed" }),
      PackageModel.countDocuments(),
      PackageModel.countDocuments({ status: true }),
      SuperAdminModel.countDocuments({ status: "active" }),
      SubscriptionModel.countDocuments(),
      SubscriptionModel.countDocuments({
        status: "active",
        end_date: { $gt: now },
      }),
      SubscriptionModel.countDocuments({
        status: "active",
        end_date: { $gte: now, $lte: in30Days },
      }),
      ClientModel.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          "company_name email subdomain status provisioning_status createdAt",
        ),
    ]);

    SuccessResponse(res, {
      message: "Dashboard stats",
      data: {
        clients: {
          total: totalClients,
          active: activeClients,
          suspended: suspendedClients,
          pending: pendingClients,
          failed_provisioning: failedProvisioning,
        },
        packages: {
          total: totalPackages,
          active: activePackages,
        },
        admins: {
          total: totalAdmins,
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          expiring_within_30_days: expiringSoon,
        },
        recent_clients: recentClients,
      },
    });
  },
);
