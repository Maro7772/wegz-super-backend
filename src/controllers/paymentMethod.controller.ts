import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import {
  PaymentMethodModel,
  PAYMENT_METHOD_STATUSES,
} from "../models/PaymentMethod";
import { OrderModel } from "../models/Order";
import {
  getFileUrl,
  deleteUploadedFile,
} from "../middlewares/upload.middleware";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import { escapeRegex } from "../utils/regex";

function formatPaymentMethodResponse(req: any, method: any) {
  const obj = typeof method.toObject === "function" ? method.toObject() : { ...method };
  return {
    ...obj,
    id: obj._id,
    icon: getFileUrl(req, obj.icon),
  };
}

/**
 * POST /api/admin/payment-methods
 * multipart/form-data:
 * - name: string (required)
 * - description?: string
 * - status?: "active" | "inactive"
 * - icon?: file
 */
export const createPaymentMethod = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, description, status } = req.body as any;

    if (!name || typeof name !== "string" || !name.trim()) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("name is required");
    }

    if (status !== undefined && !PAYMENT_METHOD_STATUSES.includes(status)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest(
        `status must be one of: ${PAYMENT_METHOD_STATUSES.join(", ")}`,
      );
    }

    const icon = req.file ? req.file.filename : undefined;

    const method = await PaymentMethodModel.create({
      name: name.trim(),
      description: description ? String(description).trim() : undefined,
      status: status ?? "active",
      icon,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "payment_method.create",
      targetType: "PaymentMethod",
      targetId: method._id,
      metadata: { name: method.name, status: method.status, icon: method.icon },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      {
        message: "Payment method created",
        data: { payment_method: formatPaymentMethodResponse(req, method) },
      },
      201,
    );
  },
);

/**
 * GET /api/admin/payment-methods
 * query: status, search, page, limit
 */
export const listPaymentMethods = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, search, page, limit } = req.query as any;

    const filter: any = {};
    if (status) {
      if (!PAYMENT_METHOD_STATUSES.includes(status)) {
        throw new BadRequest(
          `status must be one of: ${PAYMENT_METHOD_STATUSES.join(", ")}`,
        );
      }
      filter.status = status;
    }

    if (search) {
      filter.name = new RegExp(escapeRegex(search), "i");
    }

    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const query = PaymentMethodModel.find(filter).sort({ createdAt: -1 });

    if (isPaginated) {
      query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [methods, total] = await Promise.all([
      query.lean(),
      PaymentMethodModel.countDocuments(filter),
    ]);

    const formatted = methods.map((m) => formatPaymentMethodResponse(req, m));

    SuccessResponse(res, {
      message: "Payment methods retrieved",
      data: {
        payment_methods: formatted,
        total,
        page: isPaginated ? pageNum : 1,
        limit: isPaginated ? limitNum : total,
        totalPages: isPaginated ? Math.ceil(total / limitNum) : 1,
      },
    });
  },
);

/**
 * GET /api/admin/payment-methods/:id
 */
export const getPaymentMethodById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid payment method id");
    }

    const method = await PaymentMethodModel.findById(id).lean();
    if (!method) throw new NotFound("Payment method not found");

    SuccessResponse(res, {
      message: "Payment method retrieved",
      data: { payment_method: formatPaymentMethodResponse(req, method) },
    });
  },
);

/**
 * PATCH /api/admin/payment-methods/:id
 * multipart/form-data or json
 * if new icon uploaded: delete old icon from disk and set new
 */
export const updatePaymentMethod = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("Invalid payment method id");
    }

    const method = await PaymentMethodModel.findById(id);
    if (!method) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new NotFound("Payment method not found");
    }

    const { name, description, status } = req.body as any;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new BadRequest("name cannot be empty");
      }
      method.name = name.trim();
    }

    if (description !== undefined) {
      method.description = String(description).trim();
    }

    if (status !== undefined) {
      if (!PAYMENT_METHOD_STATUSES.includes(status)) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new BadRequest(
          `status must be one of: ${PAYMENT_METHOD_STATUSES.join(", ")}`,
        );
      }
      method.status = status;
    }

    // إذا تم رفع أيقونة جديدة: حذف القديمة ورفع الجديدة
    if (req.file) {
      if (method.icon) {
        deleteUploadedFile(method.icon);
      }
      method.icon = req.file.filename;
    }

    await method.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "payment_method.update",
      targetType: "PaymentMethod",
      targetId: method._id,
      metadata: { name: method.name, status: method.status, icon: method.icon },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Payment method updated",
      data: { payment_method: formatPaymentMethodResponse(req, method) },
    });
  },
);

/**
 * DELETE /api/admin/payment-methods/:id
 * deletes old image if exists and deletes record
 */
export const deletePaymentMethod = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid payment method id");
    }

    const method = await PaymentMethodModel.findById(id);
    if (!method) throw new NotFound("Payment method not found");

    const ordersCount = await OrderModel.countDocuments({
      payment_method_id: method._id,
    });
    if (ordersCount > 0) {
      throw new BadRequest(
        `Cannot delete payment method. It is used in ${ordersCount} order(s). Set status to inactive instead.`,
      );
    }

    // حذف الأيقونة القديمة من القرص
    if (method.icon) {
      deleteUploadedFile(method.icon);
    }

    await method.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "payment_method.delete",
      targetType: "PaymentMethod",
      targetId: method._id,
      metadata: { name: method.name },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Payment method deleted" });
  },
);
