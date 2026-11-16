import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { OrderModel, ORDER_STATUSES } from "../models/Order";
import { PackageModel } from "../models/Package";
import { PaymentMethodModel } from "../models/PaymentMethod";
import { ClientModel } from "../models/Client";
import {
  getFileUrl,
  deleteUploadedFile,
} from "../middlewares/upload.middleware";
import { addMonthsSafe } from "../utils/subscriptionDate.util";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

function formatOrderResponse(req: any, order: any) {
  const obj = typeof order.toObject === "function" ? order.toObject() : { ...order };
  return {
    ...obj,
    id: obj._id,
    receipt: getFileUrl(req, obj.receipt),
  };
}

/**
 * GET /api/admin/orders/lists
 * lists => payment_methods id, name, packages id, name, clients id, company_name, subdomain
 * where status active
 */
export const getOrderLists = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const [paymentMethods, packages, clients] = await Promise.all([
      PaymentMethodModel.find({ status: "active" }).select("_id name").lean(),
      PackageModel.find({ status: "active" }).select("_id name").lean(),
      ClientModel.find({ status: "active" })
        .select("_id company_name subdomain")
        .lean(),
    ]);

    SuccessResponse(res, {
      message: "Order form lists retrieved",
      data: {
        payment_methods: paymentMethods.map((pm) => ({
          id: pm._id,
          name: pm.name,
        })),
        packages: packages.map((pkg) => ({
          id: pkg._id,
          name: pkg.name,
        })),
        clients: clients.map((c) => ({
          id: c._id,
          company_name: c.company_name,
          subdomain: c.subdomain,
        })),
      },
    });
  },
);

/**
 * GET /api/admin/orders (view_orders)
 * pagination filter by status
 * query: status, client_id, package_id, payment_method_id, page, limit
 */
export const listOrders = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, client_id, package_id, payment_method_id, page, limit } =
      req.query as any;

    const filter: any = {};
    if (status) {
      if (!ORDER_STATUSES.includes(status)) {
        throw new BadRequest(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
      }
      filter.status = status;
    }

    if (client_id) {
      if (!mongoose.Types.ObjectId.isValid(client_id)) {
        throw new BadRequest("Invalid client_id");
      }
      filter.client_id = client_id;
    }

    if (package_id) {
      if (!mongoose.Types.ObjectId.isValid(package_id)) {
        throw new BadRequest("Invalid package_id");
      }
      filter.package_id = package_id;
    }

    if (payment_method_id) {
      if (!mongoose.Types.ObjectId.isValid(payment_method_id)) {
        throw new BadRequest("Invalid payment_method_id");
      }
      filter.payment_method_id = payment_method_id;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("package_id", "name price months discount")
        .populate("payment_method_id", "name icon description")
        .populate("client_id", "company_name email subdomain")
        .lean(),
      OrderModel.countDocuments(filter),
    ]);

    const formatted = orders.map((o) => formatOrderResponse(req, o));

    SuccessResponse(res, {
      message: "Orders retrieved",
      data: {
        orders: formatted,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  },
);

/**
 * GET /api/admin/orders/:id
 */
export const getOrderById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid order id");
    }

    const order = await OrderModel.findById(id)
      .populate("package_id", "name price months discount")
      .populate("payment_method_id", "name icon description")
      .populate("client_id", "company_name email subdomain")
      .lean();

    if (!order) throw new NotFound("Order not found");

    SuccessResponse(res, {
      message: "Order retrieved",
      data: { order: formatOrderResponse(req, order) },
    });
  },
);

/**
 * POST /api/admin/orders/:id/approve
 * if select approve:
 * Client.start_date = now()
 * Client.end_date = now() + orders.package.months عدد الشهور تزودهم
 */
export const approveOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid order id");
    }

    const order = await OrderModel.findById(id);
    if (!order) throw new NotFound("Order not found");

    if (order.status === "approve") {
      throw new BadRequest("Order is already approved");
    }

    const [pkg, client] = await Promise.all([
      PackageModel.findById(order.package_id),
      ClientModel.findById(order.client_id),
    ]);

    if (!pkg) throw new NotFound("Package not found");
    if (!client) throw new NotFound("Client not found");

    const now = new Date();
    client.start_date = now;
    client.end_date = addMonthsSafe(now, pkg.months);
    client.status = "active";
    await client.save();

    order.status = "approve";
    order.reject_reason = null;
    await order.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "order.approve",
      targetType: "Order",
      targetId: order._id,
      metadata: {
        client_id: client._id,
        package_id: pkg._id,
        months: pkg.months,
        start_date: client.start_date,
        end_date: client.end_date,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Order approved successfully",
      data: {
        order: formatOrderResponse(req, order),
        client: {
          id: client._id,
          company_name: client.company_name,
          subdomain: client.subdomain,
          status: client.status,
          start_date: client.start_date,
          end_date: client.end_date,
        },
      },
    });
  },
);

/**
 * POST /api/admin/orders/:id/reject
 * if reject:
 * يدخل قيمة ل reject_reason
 */
export const rejectOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid order id");
    }

    const order = await OrderModel.findById(id);
    if (!order) throw new NotFound("Order not found");

    if (order.status === "reject") {
      throw new BadRequest("Order is already rejected");
    }

    const reason = req.body?.reject_reason ?? req.body?.reason;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new BadRequest("reject_reason is required");
    }

    order.status = "reject";
    order.reject_reason = reason.trim();
    await order.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "order.reject",
      targetType: "Order",
      targetId: order._id,
      metadata: {
        client_id: order.client_id,
        reject_reason: order.reject_reason,
      },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Order rejected successfully",
      data: { order: formatOrderResponse(req, order) },
    });
  },
);

/**
 * POST /api/admin/orders (add)
 * multipart/form-data or json
 * fields: package_id, client_id, payment_method_id, price?, discount?, final_price?, status?, reject_reason?
 * file: receipt
 */
export const createOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      package_id,
      client_id,
      payment_method_id,
      price,
      discount,
      final_price,
      status,
      reject_reason,
    } = req.body as any;

    if (!package_id || !mongoose.Types.ObjectId.isValid(package_id)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("Valid package_id is required");
    }

    if (!client_id || !mongoose.Types.ObjectId.isValid(client_id)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("Valid client_id is required");
    }

    if (
      !payment_method_id ||
      !mongoose.Types.ObjectId.isValid(payment_method_id)
    ) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("Valid payment_method_id is required");
    }

    const [pkg, client, paymentMethod] = await Promise.all([
      PackageModel.findById(package_id),
      ClientModel.findById(client_id),
      PaymentMethodModel.findById(payment_method_id),
    ]);

    if (!pkg) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new NotFound("Package not found");
    }
    if (!client) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new NotFound("Client not found");
    }
    if (!paymentMethod) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new NotFound("Payment method not found");
    }

    if (status !== undefined && !ORDER_STATUSES.includes(status)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
    }

    if (status === "reject" && (!reject_reason || !String(reject_reason).trim())) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("reject_reason is required when status is reject");
    }

    const calcPrice = price !== undefined ? Number(price) : pkg.price;
    const calcDiscount =
      discount !== undefined ? Number(discount) : (pkg.discount || 0);
    const calcFinalPrice =
      final_price !== undefined
        ? Number(final_price)
        : Math.max(0, calcPrice - calcDiscount);

    const receipt = req.file ? req.file.filename : undefined;

    const order = await OrderModel.create({
      package_id: pkg._id,
      client_id: client._id,
      payment_method_id: paymentMethod._id,
      price: calcPrice,
      discount: calcDiscount,
      final_price: calcFinalPrice,
      status: status ?? "pending",
      reject_reason: status === "reject" ? String(reject_reason).trim() : null,
      receipt,
    });

    // لو أنشئت بحالة approve فوراً، نقوم بتحديث تواريخ اشتراك العميل
    if (order.status === "approve") {
      const now = new Date();
      client.start_date = now;
      client.end_date = addMonthsSafe(now, pkg.months);
      client.status = "active";
      await client.save();
    }

    await logAudit({
      adminId: req.admin!.id,
      action: "order.create",
      targetType: "Order",
      targetId: order._id,
      metadata: {
        client_id: order.client_id,
        package_id: order.package_id,
        status: order.status,
      },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      {
        message: "Order created successfully",
        data: { order: formatOrderResponse(req, order) },
      },
      201,
    );
  },
);

/**
 * PATCH /api/admin/orders/:id (update)
 * multipart/form-data or json
 */
export const updateOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new BadRequest("Invalid order id");
    }

    const order = await OrderModel.findById(id);
    if (!order) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new NotFound("Order not found");
    }

    const {
      package_id,
      payment_method_id,
      price,
      discount,
      final_price,
      status,
      reject_reason,
    } = req.body as any;

    if (package_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(package_id)) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new BadRequest("Invalid package_id");
      }
      const pkg = await PackageModel.findById(package_id);
      if (!pkg) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new NotFound("Package not found");
      }
      order.package_id = pkg._id;
    }

    if (payment_method_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(payment_method_id)) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new BadRequest("Invalid payment_method_id");
      }
      const pm = await PaymentMethodModel.findById(payment_method_id);
      if (!pm) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new NotFound("Payment method not found");
      }
      order.payment_method_id = pm._id;
    }

    if (price !== undefined) {
      order.price = Number(price);
    }

    if (discount !== undefined) {
      order.discount = Number(discount);
    }

    if (final_price !== undefined) {
      order.final_price = Number(final_price);
    } else if (price !== undefined || discount !== undefined) {
      order.final_price = Math.max(0, order.price - order.discount);
    }

    if (status !== undefined) {
      if (!ORDER_STATUSES.includes(status)) {
        if (req.file) deleteUploadedFile(req.file.filename);
        throw new BadRequest(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
      }

      if (status === "reject") {
        const reason = reject_reason ?? order.reject_reason;
        if (!reason || !String(reason).trim()) {
          if (req.file) deleteUploadedFile(req.file.filename);
          throw new BadRequest("reject_reason is required when status is reject");
        }
        order.reject_reason = String(reason).trim();
      } else {
        order.reject_reason = null;
      }

      // إذا تحول إلى approve
      if (status === "approve" && order.status !== "approve") {
        const [pkg, client] = await Promise.all([
          PackageModel.findById(order.package_id),
          ClientModel.findById(order.client_id),
        ]);
        if (pkg && client) {
          const now = new Date();
          client.start_date = now;
          client.end_date = addMonthsSafe(now, pkg.months);
          client.status = "active";
          await client.save();
        }
      }

      order.status = status;
    }

    if (reject_reason !== undefined && order.status === "reject") {
      order.reject_reason = String(reject_reason).trim();
    }

    if (req.file) {
      if (order.receipt) {
        deleteUploadedFile(order.receipt);
      }
      order.receipt = req.file.filename;
    }

    await order.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "order.update",
      targetType: "Order",
      targetId: order._id,
      metadata: { status: order.status, final_price: order.final_price },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Order updated successfully",
      data: { order: formatOrderResponse(req, order) },
    });
  },
);

/**
 * DELETE /api/admin/orders/:id (delete)
 */
export const deleteOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid order id");
    }

    const order = await OrderModel.findById(id);
    if (!order) throw new NotFound("Order not found");

    if (order.receipt) {
      deleteUploadedFile(order.receipt);
    }

    await order.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "order.delete",
      targetType: "Order",
      targetId: order._id,
      metadata: { client_id: order.client_id },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Order deleted successfully" });
  },
);
