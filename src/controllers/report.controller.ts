import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { PaymentModel } from "../models/Payment";
import { SaleModel } from "../models/Sale";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

function mapByClient(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) map.set(String(item._id), item);
  return map;
}

/**
 * GET /api/admin/reports/operations
 * تقرير تشغيلي لكل العملاء: التصنيف، الحالة، إجمالي المدفوع، المعلّق.
 */
export const getOperationReports = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const clients = await ClientModel.find()
      .select("-password")
      .populate("category_id", "name")
      .populate("subcategory_id", "name")
      .populate("sales_agent_id", "name email")
      .sort({ createdAt: -1 });

    const ids = clients.map((c) => c._id);

    const [paid, pending] = await Promise.all([
      PaymentModel.aggregate([
        { $match: { client_id: { $in: ids }, status: "approve" } },
        {
          $group: {
            _id: "$client_id",
            total_paid: { $sum: "$amount" },
            payments_count: { $sum: 1 },
            last_payment_date: { $max: "$date" },
          },
        },
      ]),
      PaymentModel.aggregate([
        { $match: { client_id: { $in: ids }, status: "pending" } },
        {
          $group: {
            _id: "$client_id",
            pending_amount: { $sum: "$amount" },
            pending_count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const paidMap = mapByClient(paid);
    const pendingMap = mapByClient(pending);

    const reports = clients.map((client) => {
      const key = String(client._id);
      const pay: any = paidMap.get(key) ?? {};
      const pend: any = pendingMap.get(key) ?? {};

      return {
        ...client.toObject(),
        total_paid: pay.total_paid ?? 0,
        payments_count: pay.payments_count ?? 0,
        pending_amount: pend.pending_amount ?? 0,
        pending_count: pend.pending_count ?? 0,
        last_payment_date: pay.last_payment_date ?? client.last_payment_date ?? null,
      };
    });

    SuccessResponse(res, {
      message: "Operation reports retrieved",
      data: { reports },
    });
  },
);

/**
 * GET /api/admin/reports/operations/:id
 */
export const getOperationReportById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id)
      .select("-password")
      .populate("category_id", "name")
      .populate("subcategory_id", "name")
      .populate("sales_agent_id", "name email");

    if (!client) throw new NotFound("Client report not found");

    const [payments, sales] = await Promise.all([
      PaymentModel.find({ client_id: client._id }).sort({ date: -1 }),
      SaleModel.find({ client_id: client._id }).sort({ sale_date: -1 }),
    ]);

    const totalPaid = payments
      .filter((p) => p.status === "approve")
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = payments
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0);

    SuccessResponse(res, {
      message: "Operation report details retrieved",
      data: {
        client,
        payments,
        sales,
        totals: {
          total_paid: totalPaid,
          pending_amount: pendingAmount,
          payments_count: payments.length,
        },
      },
    });
  },
);

/**
 * POST /api/admin/reports/operations/:id/notes
 * body: { text }
 */
export const addOperationNote = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { text } = req.body as any;
    if (!text || !String(text).trim()) {
      throw new BadRequest("Note text is required");
    }

    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    client.notes = client.notes ?? [];
    client.notes.push({
      text: String(text).trim(),
      created_at: new Date(),
      created_by: req.admin!.id as any,
    });
    await client.save();

    SuccessResponse(
      res,
      { message: "Note added successfully", data: { notes: client.notes } },
      201,
    );
  },
);

/**
 * DELETE /api/admin/reports/operations/:id/notes/:noteIndex
 */
export const deleteOperationNote = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id, noteIndex } = req.params;

    const client = await ClientModel.findById(id);
    if (!client) throw new NotFound("Client not found");

    const index = Number(noteIndex);
    if (!client.notes || !client.notes[index]) {
      throw new NotFound("Note not found");
    }

    client.notes.splice(index, 1);
    await client.save();

    SuccessResponse(res, {
      message: "Note deleted successfully",
      data: { notes: client.notes },
    });
  },
);

/**
 * PATCH /api/admin/reports/operations/:id/status
 * body: { status?, operation_status? }
 */
export const updateOperationStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, operation_status } = req.body as any;

    if (status === undefined && operation_status === undefined) {
      throw new BadRequest("Nothing to update");
    }

    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    if (status !== undefined) client.status = status;
    if (operation_status !== undefined) {
      client.operation_status = operation_status;
    }
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "operation_report.update_status",
      targetType: "Client",
      targetId: client._id,
      metadata: { status, operation_status },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Status updated successfully",
      data: { client },
    });
  },
);

/**
 * GET /api/admin/reports/clients
 * ملخّص العملاء حسب الحالة / التصنيف / operation_status.
 */
export const getClientsReport = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const [byStatus, byCategory, byOperationStatus, total] = await Promise.all([
      ClientModel.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ClientModel.aggregate([
        { $group: { _id: "$category_id", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            category_id: "$_id",
            name: { $ifNull: ["$category.name", "Uncategorized"] },
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ]),
      ClientModel.aggregate([
        { $group: { _id: "$operation_status", count: { $sum: 1 } } },
      ]),
      ClientModel.countDocuments(),
    ]);

    SuccessResponse(res, {
      message: "Clients report retrieved",
      data: {
        total,
        by_status: byStatus,
        by_operation_status: byOperationStatus,
        by_category: byCategory,
      },
    });
  },
);
