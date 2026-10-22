import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { PaymentModel } from "../models/Payment";
import { ClientModel } from "../models/Client";
import { SuccessResponse } from "../utils/response";
import { env } from "../config/env";

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: any = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return range;
}

function paymentMatch(from?: string, to?: string, extra: any = {}) {
  const match: any = { ...extra };
  const range = dateRange(from, to);
  if (range) match.date = range;
  return match;
}

/**
 * GET /api/admin/financial-reports/summary?from=&to=
 */
export const getFinancialSummary = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as any;
    const match = paymentMatch(from, to);

    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);

    const [byStatus, activeClients, totalClients, last30Days, pendingAging] =
      await Promise.all([
        PaymentModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              total: { $sum: "$amount" },
            },
          },
        ]),
        ClientModel.countDocuments({ status: "active" }),
        ClientModel.countDocuments(),
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
      ]);

    const get = (status: string) =>
      byStatus.find((s: any) => s._id === status) ?? { count: 0, total: 0 };

    const approved = get("approve");
    const pending = get("pending");
    const rejected = get("reject");

    SuccessResponse(res, {
      message: "Financial summary retrieved",
      data: {
        currency: env.CURRENCY,
        revenue: {
          approved: approved.total,
          pending: pending.total,
          rejected: rejected.total,
          total_invoiced: approved.total + pending.total,
        },
        payments: {
          approved_count: approved.count,
          pending_count: pending.count,
          rejected_count: rejected.count,
          average_payment:
            approved.count > 0 ? approved.total / approved.count : 0,
        },
        collection_rate:
          approved.total + pending.total > 0
            ? Number(
                (
                  (approved.total / (approved.total + pending.total)) *
                  100
                ).toFixed(2),
              )
            : 0,
        mrr_last_30_days: last30Days[0]?.total ?? 0,
        active_clients: activeClients,
        total_clients: totalClients,
        pending_payments: pendingAging[0] ?? { count: 0, total: 0 },
        range: { from: from ?? null, to: to ?? null },
      },
    });
  },
);

/**
 * GET /api/admin/financial-reports/monthly?year=2026&from=&to=
 */
export const getMonthlyRevenue = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { year, from, to } = req.query as any;

    const match: any = { status: "approve" };
    if (year) {
      const y = Number(year);
      match.date = {
        $gte: new Date(`${y}-01-01`),
        $lt: new Date(`${y + 1}-01-01`),
      };
    } else {
      const range = dateRange(from, to);
      if (range) match.date = range;
    }

    const rows = await PaymentModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$date",
              timezone: env.TIMEZONE,
            },
          },
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, month: "$_id", count: 1, total: 1 } },
    ]);

    SuccessResponse(res, {
      message: "Monthly revenue retrieved",
      data: { currency: env.CURRENCY, months: rows },
    });
  },
);

/**
 * GET /api/admin/financial-reports/by-section?from=&to=
 * توزيع الإيرادات على السكاشن.
 * ملاحظة: العميل اللي عنده أكتر من سيكشن بيتحسب في كل واحد منهم،
 * فمجموع الصفوف مش لازم يساوي إجمالي الإيراد.
 */
export const getRevenueBySection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as any;
    const match = paymentMatch(from, to, { status: "approve" });

    const rows = await PaymentModel.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "clients",
          localField: "client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: { path: "$client", preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: "$client.sections",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$client.sections",
          clients: { $addToSet: "$client._id" },
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "_id",
          foreignField: "_id",
          as: "section",
        },
      },
      { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          section_id: "$_id",
          key: { $ifNull: ["$section.key", null] },
          name: { $ifNull: ["$section.name", "No section"] },
          clients_count: { $size: "$clients" },
          payments_count: "$count",
          total: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    SuccessResponse(res, {
      message: "Revenue by section retrieved",
      data: { currency: env.CURRENCY, sections: rows },
    });
  },
);

// Backward-compatible alias (نفس البيانات بشكل السكاشن)
export const getRevenueByCategory = getRevenueBySection;

/**
 * GET /api/admin/financial-reports/by-sales-agent?from=&to=
 */
export const getRevenueBySalesAgent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as any;
    const match = paymentMatch(from, to, { status: "approve" });

    const rows = await PaymentModel.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "clients",
          localField: "client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: { path: "$client", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            id: "$client.sales_agent_id",
            name: "$client.sales_man_name",
          },
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "superadmins",
          localField: "_id.id",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          sales_agent_id: "$_id.id",
          name: {
            $ifNull: ["$agent.name", { $ifNull: ["$_id.name", "Unassigned"] }],
          },
          count: 1,
          total: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    SuccessResponse(res, {
      message: "Revenue by sales agent retrieved",
      data: { currency: env.CURRENCY, sales_agents: rows },
    });
  },
);

/**
 * GET /api/admin/financial-reports/pending
 * قائمة الدفعات المعلّقة + عمرها بالأيام.
 */
export const getPendingPaymentsReport = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const pending = await PaymentModel.find({ status: "pending" })
      .populate("client_id", "company_name email subdomain status")
      .sort({ date: 1 });

    const now = Date.now();
    const payments = pending.map((p) => ({
      ...p.toObject(),
      age_days: Math.max(
        0,
        Math.floor((now - new Date(p.date).getTime()) / 86_400_000),
      ),
    }));

    const total = payments.reduce((sum, p) => sum + p.amount, 0);

    SuccessResponse(res, {
      message: "Pending payments retrieved",
      data: {
        currency: env.CURRENCY,
        count: payments.length,
        total,
        payments,
      },
    });
  },
);
