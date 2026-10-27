import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SaleModel } from "../models/Sale";
import { PaymentModel } from "../models/Payment";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import { env } from "../config/env";

/**
 * POST /api/admin/sales
 * body: {
 *   client_id, amount, discount?, cycle?, sale_date?, status?,
 *   sales_agent_id?, sales_agent_name?, sales_agent_phone?, notes?
 * }
 */
export const createSale = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      client_id,
      amount,
      discount,
      cycle,
      sale_date,
      status,
      sales_agent_id,
      sales_agent_name,
      sales_agent_phone,
      notes,
    } = req.body as any;

    if (!client_id) throw new BadRequest("client_id is required");
    if (amount === undefined || Number(amount) < 0) {
      throw new BadRequest("amount is required and must be >= 0");
    }

    const client = await ClientModel.findById(client_id);
    if (!client) throw new NotFound("Client not found");

    const sale = await SaleModel.create({
      client_id,
      amount: Number(amount),
      discount: Number(discount ?? 0),
      currency: req.body.currency ?? env.CURRENCY,
      cycle: cycle ?? client.payment_cycle ?? "monthly",
      sale_date: sale_date ? new Date(sale_date) : new Date(),
      status: status ?? "pending",
      sales_agent_id: sales_agent_id ?? client.sales_agent_id,
      sales_agent_name: sales_agent_name ?? client.sales_man_name,
      sales_agent_phone: sales_agent_phone ?? client.sales_man_phone,
      notes,
      created_by: req.admin!.id as any,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "sale.create",
      targetType: "Sale",
      targetId: sale._id,
      metadata: {
        client_id,
        amount: sale.amount,
        total: sale.total,
        status: sale.status,
      },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Sale created", data: { sale } }, 201);
  },
);

/**
 * GET /api/admin/sales
 * query: client_id, status, cycle, sales_agent_id, from, to, page, limit, sort
 */
export const listSales = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      client_id,
      status,
      cycle,
      sales_agent_id,
      from,
      to,
      page = "1",
      limit = "20",
      sort = "-sale_date",
    } = req.query as any;

    const filter: any = {};
    if (client_id) filter.client_id = client_id;
    if (status) filter.status = status;
    if (cycle) filter.cycle = cycle;
    if (sales_agent_id) filter.sales_agent_id = sales_agent_id;

    if (from || to) {
      filter.sale_date = {};
      if (from) filter.sale_date.$gte = new Date(from);
      if (to) filter.sale_date.$lte = new Date(to);
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));

    const [sales, total] = await Promise.all([
      SaleModel.find(filter)
        .populate("client_id", "company_name email subdomain status")
        .populate("sales_agent_id", "name email")
        .sort(String(sort))
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      SaleModel.countDocuments(filter),
    ]);

    SuccessResponse(res, {
      message: "Sales retrieved",
      data: {
        sales,
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
 * GET /api/admin/sales/stats
 * query: from, to
 */
export const getSalesStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as any;
    const match: any = {};
    if (from || to) {
      match.sale_date = {};
      if (from) match.sale_date.$gte = new Date(from);
      if (to) match.sale_date.$lte = new Date(to);
    }

    const [byStatus, byAgent, monthly, totals] = await Promise.all([
      SaleModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$total" },
          },
        },
      ]),
      SaleModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { id: "$sales_agent_id", name: "$sales_agent_name" },
            count: { $sum: 1 },
            total: { $sum: "$total" },
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
            sales_agent_id: "$_id.id",
            name: { $ifNull: ["$agent.name", "$_id.name"] },
            count: 1,
            total: 1,
          },
        },
        { $sort: { total: -1 } },
      ]),
      SaleModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              year: { $year: "$sale_date" },
              month: { $month: "$sale_date" },
            },
            count: { $sum: 1 },
            total: { $sum: "$total" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      SaleModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
            discount: { $sum: "$discount" },
            total: { $sum: "$total" },
          },
        },
      ]),
    ]);

    SuccessResponse(res, {
      message: "Sales stats retrieved",
      data: {
        totals: totals[0] ?? { count: 0, amount: 0, discount: 0, total: 0 },
        by_status: byStatus,
        by_sales_agent: byAgent,
        monthly: monthly.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          total: m.total,
        })),
        currency: env.CURRENCY,
      },
    });
  },
);

/**
 * GET /api/admin/sales/:id
 */
export const getSaleById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sale = await SaleModel.findById(req.params.id)
      .populate("client_id", "company_name email subdomain status")
      .populate("sales_agent_id", "name email");

    if (!sale) throw new NotFound("Sale not found");

    SuccessResponse(res, {
      message: "Sale retrieved",
      data: { sale },
    });
  },
);

/**
 * PATCH /api/admin/sales/:id
 */
export const updateSale = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sale = await SaleModel.findById(req.params.id);
    if (!sale) throw new NotFound("Sale not found");

    const allowed = [
      "amount",
      "discount",
      "currency",
      "cycle",
      "sale_date",
      "status",
      "sales_agent_id",
      "sales_agent_name",
      "sales_agent_phone",
      "notes",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        (sale as any)[key] =
          key === "sale_date" ? new Date(req.body[key]) : req.body[key];
      }
    }

    if (sale.amount < 0) throw new BadRequest("amount must be >= 0");
    if (sale.discount < 0) throw new BadRequest("discount must be >= 0");

    sale.total = Math.max(0, sale.amount - sale.discount);
    await sale.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "sale.update",
      targetType: "Sale",
      targetId: sale._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Sale updated", data: { sale } });
  },
);

/**
 * DELETE /api/admin/sales/:id
 */
export const deleteSale = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const sale = await SaleModel.findById(req.params.id);
    if (!sale) throw new NotFound("Sale not found");

    // الدفعات المرتبطة بالبيع تفضل موجودة (سجل مالي)، بنفكّ الربط بس
    // عشان ما يبقاش فيه sale_id بيشاور على Sale محذوف.
    await PaymentModel.updateMany(
      { sale_id: sale._id },
      { $unset: { sale_id: 1 } },
    );

    await sale.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "sale.delete",
      targetType: "Sale",
      targetId: sale._id,
      metadata: { sale_no: sale.sale_no },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Sale deleted" });
  },
);
