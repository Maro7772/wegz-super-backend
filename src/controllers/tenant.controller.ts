import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { TenantRequest } from "../middlewares/tenantAuth.middleware";
import { ClientModel } from "../models/Client";
import { PaymentModel } from "../models/Payment";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { env } from "../config/env";

/**
 * GET /api/tenant/verify
 * محمي بـ tenantAuth middleware — يعتمد على X-Tenant-Api-Key.
 * يُستدعى من Client Backend للتحقق من حالة العميل.
 */
export const verifyTenant = asyncHandler(
  async (req: TenantRequest, res: Response) => {
    const client = await ClientModel.findById(req.tenantClientId).populate(
      "sections",
      "key name ar_name",
    );

    if (!client) throw new NotFound("Tenant not found");

    const active = client.status === "active";

    SuccessResponse(res, {
      message: active ? "Tenant verified" : "Tenant is not active",
      data: {
        tenant: {
          company_name: client.company_name,
          subdomain: client.subdomain,
          subdomain_url: client.subdomain_url,
          db_name: client.db_name,
          status: client.status,
          active,
          sections: ((client as any).sections ?? [])
            .filter(Boolean)
            .map((section: any) => ({
              id: section._id,
              key: section.key,
              name: section.name,
              ar_name: section.ar_name ?? null,
            })),
        },
      },
    });
  },
);

/**
 * POST /api/tenant/payments
 * العميل يرفع إثبات دفع → يظهر في Super كـ pending.
 * body: { amount, method?, payment_cycle?, reference?, screenshot?, notes? }
 */
export const submitTenantPayment = asyncHandler(
  async (req: TenantRequest, res: Response) => {
    const client = await ClientModel.findById(req.tenantClientId);
    if (!client) throw new NotFound("Tenant not found");

    const { amount, method, payment_cycle, reference, screenshot, notes } =
      req.body as any;

    if (amount === undefined || Number(amount) <= 0) {
      throw new BadRequest("amount is required and must be greater than 0");
    }

    const payment = await PaymentModel.create({
      client_id: client._id,
      amount: Number(amount),
      currency: req.body.currency ?? env.CURRENCY,
      date: new Date(),
      status: "pending",
      method: method ?? "bank_transfer",
      payment_cycle: payment_cycle ?? client.payment_cycle ?? "monthly",
      reference: reference ? String(reference) : undefined,
      screenshot,
      notes,
    });

    SuccessResponse(
      res,
      {
        message: "Payment submitted and waiting for approval",
        data: {
          payment: {
            id: payment._id,
            reference: payment.reference,
            amount: payment.amount,
            status: payment.status,
            date: payment.date,
          },
        },
      },
      201,
    );
  },
);

/**
 * GET /api/tenant/payments
 */
export const listTenantPayments = asyncHandler(
  async (req: TenantRequest, res: Response) => {
    const payments = await PaymentModel.find({ client_id: req.tenantClientId })
      .sort({ date: -1 })
      .select("-reviewed_by -created_by");

    SuccessResponse(res, {
      message: "Payments retrieved",
      data: { payments, currency: env.CURRENCY },
    });
  },
);
