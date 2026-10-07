import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SubscriptionModel } from "../models/Subscription";
import { ClientModel } from "../models/Client";
import { PackageModel } from "../models/Package";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

/**
 * GET /api/admin/subscriptions
 * يدعم filter: ?status=active|expired|cancelled
 *              ?client_id=...
 *              ?expiring_within_days=30
 */
export const listSubscriptions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, client_id, expiring_within_days } = req.query as any;

    const filter: any = {};
    if (status) filter.status = status;
    if (client_id) filter.client_id = client_id;

    if (expiring_within_days) {
      const days = Number(expiring_within_days);
      const now = new Date();
      const limit = new Date();
      limit.setDate(limit.getDate() + days);
      filter.end_date = { $gte: now, $lte: limit };
      filter.status = "active";
    }

    const subs = await SubscriptionModel.find(filter)
      .sort({ end_date: 1 })
      .populate("client_id", "company_name email subdomain status")
      .populate("package_id", "name features");

    SuccessResponse(res, {
      message: "Subscriptions retrieved",
      data: { subscriptions: subs },
    });
  },
);

/**
 * GET /api/admin/subscriptions/:id
 */
export const getSubscriptionById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sub = await SubscriptionModel.findById(req.params.id)
      .populate("client_id", "company_name email subdomain")
      .populate("package_id");
    if (!sub) throw new NotFound("Subscription not found");
    SuccessResponse(res, {
      message: "Subscription retrieved",
      data: { subscription: sub },
    });
  },
);

/**
 * GET /api/admin/clients/:id/subscriptions
 */
export const listClientSubscriptions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    const subs = await SubscriptionModel.find({ client_id: client._id })
      .sort({ end_date: -1 })
      .populate("package_id", "name features");

    SuccessResponse(res, {
      message: "Client subscriptions retrieved",
      data: { subscriptions: subs },
    });
  },
);

/**
 * POST /api/admin/clients/:id/subscriptions
 * body: { package_id?, duration: 'monthly'|'quarterly'|'half_yearly'|'yearly', months?, feature_overrides? }
 *
 * لو مفيش package_id، يستخدم الباقة الحالية للعميل.
 * يحسب end_date من start_date + duration.
 * يلغي أي اشتراك active سابق للعميل (يخليه cancelled).
 */
export const createSubscription = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { package_id, duration, months, feature_overrides } = req.body as {
      package_id?: string;
      duration?: "monthly" | "quarterly" | "half_yearly" | "yearly";
      months?: number;
      feature_overrides?: any;
    };

    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    const pkgId = package_id ?? client.package_id.toString();
    const pkg = await PackageModel.findById(pkgId);
    if (!pkg) throw new NotFound("Package not found");

    // حساب end_date
    const start = new Date();
    const end = new Date(start);

    if (months) {
      end.setMonth(end.getMonth() + months);
    } else {
      switch (duration) {
        case "monthly":
          end.setMonth(end.getMonth() + 1);
          break;
        case "quarterly":
          end.setMonth(end.getMonth() + 3);
          break;
        case "half_yearly":
          end.setMonth(end.getMonth() + 6);
          break;
        case "yearly":
        default:
          end.setFullYear(end.getFullYear() + 1);
          break;
      }
    }

    // إلغاء أي اشتراك نشط سابق
    await SubscriptionModel.updateMany(
      { client_id: client._id, status: "active" },
      { $set: { status: "cancelled" } },
    );

    const sub = await SubscriptionModel.create({
      client_id: client._id,
      package_id: pkg._id,
      start_date: start,
      end_date: end,
      status: "active",
      feature_overrides,
    });

    // لو الباقة اتغيرت، حدّث client.package_id
    if (package_id && package_id !== client.package_id.toString()) {
      client.package_id = pkg._id as any;
      await client.save();
    }

    await logAudit({
      adminId: req.admin!.id,
      action: "subscription.create",
      targetType: "Subscription",
      targetId: sub._id,
      metadata: {
        client_id: client._id,
        package_id: pkg._id,
        duration: duration ?? `${months} months`,
        end_date: end,
      },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      { message: "Subscription created", data: { subscription: sub } },
      201,
    );
  },
);

/**
 * PATCH /api/admin/subscriptions/:id
 * body: { end_date?, status?, feature_overrides?, package_id? }
 */
export const updateSubscription = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { end_date, status, feature_overrides, package_id } = req.body as any;

    const sub = await SubscriptionModel.findById(req.params.id);
    if (!sub) throw new NotFound("Subscription not found");

    if (end_date) sub.end_date = new Date(end_date);
    if (status && ["active", "expired", "cancelled"].includes(status)) {
      sub.status = status;
    }
    if (feature_overrides !== undefined) {
      sub.feature_overrides = feature_overrides;
    }
    if (package_id) {
      const pkg = await PackageModel.findById(package_id);
      if (!pkg) throw new NotFound("Package not found");
      sub.package_id = pkg._id as any;
    }

    await sub.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "subscription.update",
      targetType: "Subscription",
      targetId: sub._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Subscription updated",
      data: { subscription: sub },
    });
  },
);

/**
 * POST /api/admin/subscriptions/:id/cancel
 */
export const cancelSubscription = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sub = await SubscriptionModel.findById(req.params.id);
    if (!sub) throw new NotFound("Subscription not found");

    if (sub.status === "cancelled") {
      throw new BadRequest("Subscription is already cancelled");
    }

    sub.status = "cancelled";
    await sub.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "subscription.cancel",
      targetType: "Subscription",
      targetId: sub._id,
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Subscription cancelled",
      data: { subscription: sub },
    });
  },
);

/**
 * DELETE /api/admin/subscriptions/:id
 */
export const deleteSubscription = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sub = await SubscriptionModel.findById(req.params.id);
    if (!sub) throw new NotFound("Subscription not found");

    await SubscriptionModel.findByIdAndDelete(sub._id);

    await logAudit({
      adminId: req.admin!.id,
      action: "subscription.delete",
      targetType: "Subscription",
      targetId: sub._id,
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Subscription deleted" });
  },
);
