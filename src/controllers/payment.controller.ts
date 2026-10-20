import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { PaymentModel } from "../models/Payment";
import { SaleModel } from "../models/Sale";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import { env } from "../config/env";

/**
 * POST /api/admin/payments
 * body: {
 *   client_id, amount, sale_id?, date?, method?, payment_cycle?,
 *   reference?, screenshot?, notes?, status?
 * }
 */
export const createPayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      client_id,
      sale_id,
      amount,
      date,
      method,
      payment_cycle,
      reference,
      screenshot,
      notes,
      status,
    } = req.body as any;

    if (!client_id) throw new BadRequest("client_id is required");
    if (amount === undefined || Number(amount) < 0) {
      throw new BadRequest("amount is required and must be >= 0");
    }

    const client = await ClientModel.findById(client_id);
    if (!client) throw new NotFound("Client not found");

    if (sale_id) {
      const sale = await SaleModel.findById(sale_id);
      if (!sale) throw new NotFound("Sale not found");
    }

    const payment = await PaymentModel.create({
      client_id,
      sale_id,
      amount: Number(amount),
      currency: req.body.currency ?? env.CURRENCY,
      date: date ? new Date(date) : new Date(),
      status: status ?? "pending",
      method: method ?? "bank_transfer",
      payment_cycle: payment_cycle ?? client.payment_cycle ?? "monthly",
      reference: reference ? String(reference) : undefined,
      screenshot,
      notes,
      created_by: req.admin!.id as any,
      ...(status === "approve" && {
        reviewed_by: req.admin!.id,
        reviewed_at: new Date(),
      }),
    });

    if (payment.status === "approve") {
      await applyApprovedPayment(payment);
    }

    await logAudit({
      adminId: req.admin!.id,
      action: "payment.create",
      targetType: "Payment",
      targetId: payment._id,
      metadata: {
        client_id,
        amount: payment.amount,
        status: payment.status,
        reference: payment.reference,
      },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Payment created", data: { payment } }, 201);
  },
);

/**
 * GET /api/admin/payments
 * query: client_id, status, method, from, to, search, page, limit
 */
export const listPayments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      client_id,
      status,
      method,
      from,
      to,
      search,
      page = "1",
      limit = "20",
    } = req.query as any;

    const filter: any = {};
    if (client_id && mongoose.isValidObjectId(client_id)) {
      filter.client_id = new mongoose.Types.ObjectId(String(client_id));
    }
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (search) filter.reference = new RegExp(String(search), "i");

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));

    const [payments, total, sums] = await Promise.all([
      PaymentModel.find(filter)
        .populate("client_id", "company_name email subdomain status")
        .populate("sale_id", "sale_no total status")
        .sort({ date: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      PaymentModel.countDocuments(filter),
      PaymentModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    SuccessResponse(res, {
      message: "Payments retrieved",
      data: {
        payments,
        summary: sums,
        currency: env.CURRENCY,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  },
);

/**
 * GET /api/admin/payments/:id
 */
export const getPaymentById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const payment = await PaymentModel.findById(req.params.id)
      .populate("client_id", "company_name email subdomain status")
      .populate("sale_id", "sale_no total status")
      .populate("reviewed_by", "name email");

    if (!payment) throw new NotFound("Payment not found");

    SuccessResponse(res, { message: "Payment retrieved", data: { payment } });
  },
);

/**
 * POST /api/admin/payments/:id/approve
 * - يعتمد الدفعة
 * - يفعّل العميل لو كان pending
 * - يحدّث بياناته المالية
 * - لو مرتبطة بـ Sale → Sale يتحول paid
 */
export const approvePayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) throw new NotFound("Payment not found");
    if (payment.status !== "pending") {
      throw new BadRequest(`Payment is already ${payment.status}`);
    }

    payment.status = "approve";
    payment.reviewed_by = req.admin!.id as any;
    payment.reviewed_at = new Date();

    const client = await applyApprovedPayment(payment);
    await payment.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "payment.approve",
      targetType: "Payment",
      targetId: payment._id,
      metadata: {
        client_id: payment.client_id,
        amount: payment.amount,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Payment approved",
      data: { payment, client },
    });
  },
);

/**
 * POST /api/admin/payments/:id/reject
 * body: { reason? }
 */
export const rejectPayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) throw new NotFound("Payment not found");
    if (payment.status !== "pending") {
      throw new BadRequest(`Payment is already ${payment.status}`);
    }

    payment.status = "reject";
    payment.rejection_reason = req.body?.reason ?? req.body?.rejection_reason;
    payment.reviewed_by = req.admin!.id as any;
    payment.reviewed_at = new Date();
    await payment.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "payment.reject",
      targetType: "Payment",
      targetId: payment._id,
      metadata: {
        client_id: payment.client_id,
        amount: payment.amount,
        reason: payment.rejection_reason,
      },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Payment rejected", data: { payment } });
  },
);

/**
 * DELETE /api/admin/payments/:id
 * مسموح فقط للدفعات pending / reject (المعتمدة جزء من الحسابات).
 */
export const deletePayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) throw new NotFound("Payment not found");
    if (payment.status === "approve") {
      throw new BadRequest(
        "Approved payments cannot be deleted. Reject/refund instead.",
      );
    }

    await payment.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "payment.delete",
      targetType: "Payment",
      targetId: payment._id,
      metadata: { reference: payment.reference, amount: payment.amount },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Payment deleted" });
  },
);

/**
 * بعد اعتماد الدفعة: تحديث العميل + الـ Sale المرتبط.
 */
async function applyApprovedPayment(payment: any) {
  const client = await ClientModel.findById(payment.client_id);
  if (!client) return null;

  if (client.status === "pending") client.status = "active";

  const allowedCycles = ["monthly", "quarterly", "half_yearly", "yearly"];
  if (allowedCycles.includes(payment.payment_cycle)) {
    client.payment_cycle = payment.payment_cycle;
  }

  client.payment_amount = payment.amount;
  client.last_payment_date = payment.date ?? new Date();
  await client.save();

  if (payment.sale_id) {
    await SaleModel.updateOne(
      { _id: payment.sale_id },
      { $set: { status: "paid" } },
    );
  }

  return client;
}
