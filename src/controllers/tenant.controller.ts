import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { TenantRequest } from "../middlewares/tenantAuth.middleware";
import { ClientModel } from "../models/Client";
import { SubscriptionModel } from "../models/Subscription";
import { NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";

/**
 * GET /api/tenant/verify
 * محمي بـ tenantAuth middleware — يعتمد على X-Tenant-Api-Key.
 * يُستدعى من Client Backend للتحقق من الاشتراك والـ features.
 */
export const verifyTenant = asyncHandler(
  async (req: TenantRequest, res: Response) => {
    const client = await ClientModel.findById(req.tenantClientId).populate(
      "package_id",
    );
    if (!client) throw new NotFound("Tenant not found");

    // آخر subscription فعّالة
    const sub = await SubscriptionModel.findOne({
      client_id: client._id,
      status: "active",
    }).sort({ end_date: -1 });

    const now = new Date();
    const subscriptionValid = !!sub && sub.end_date > now;

    const pkg: any = client.package_id;
    const overrides = sub?.feature_overrides ?? {};

    const features = {
      haveEcommerce:
        overrides.haveEcommerce ?? pkg?.features?.haveEcommerce ?? false,
      haveMobileApp:
        overrides.haveMobileApp ?? pkg?.features?.haveMobileApp ?? false,
      havePOS: overrides.havePOS ?? pkg?.features?.havePOS ?? false,
      haveReports: overrides.haveReports ?? pkg?.features?.haveReports ?? false,
      haveStockTake:
        overrides.haveStockTake ?? pkg?.features?.haveStockTake ?? false,
    };

    SuccessResponse(res, {
      message: subscriptionValid
        ? "Tenant verified"
        : "Subscription invalid or expired",
      data: {
        tenant: {
          company_name: client.company_name,
          subdomain: client.subdomain,
          status: client.status,
        },
        features: subscriptionValid ? features : {},
        package: {
          name: pkg?.name ?? null,
          status: pkg?.status ?? false,
        },
        subscription: {
          valid: subscriptionValid,
          start_date: sub?.start_date ?? null,
          end_date: sub?.end_date ?? null,
        },
      },
    });
  },
);
