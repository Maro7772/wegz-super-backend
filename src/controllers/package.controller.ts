import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { PackageModel, PACKAGE_STATUSES } from "../models/Package";
import { OrderModel } from "../models/Order";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import { escapeRegex } from "../utils/regex";

/**
 * POST /api/admin/packages
 * body: { name, price, months, status?, discount? }
 */
export const createPackage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, price, months, status, discount } = req.body as any;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new BadRequest("name is required");
    }

    if (price === undefined || Number(price) < 0 || isNaN(Number(price))) {
      throw new BadRequest("price is required and must be a number >= 0");
    }

    if (months === undefined || Number(months) < 1 || !Number.isInteger(Number(months))) {
      throw new BadRequest("months is required and must be an integer >= 1");
    }

    if (status !== undefined && !PACKAGE_STATUSES.includes(status)) {
      throw new BadRequest(`status must be one of: ${PACKAGE_STATUSES.join(", ")}`);
    }

    if (discount !== undefined && (Number(discount) < 0 || isNaN(Number(discount)))) {
      throw new BadRequest("discount must be a number >= 0");
    }

    const pkg = await PackageModel.create({
      name: name.trim(),
      price: Number(price),
      months: Number(months),
      status: status ?? "active",
      discount: discount !== undefined ? Number(discount) : 0,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "package.create",
      targetType: "Package",
      targetId: pkg._id,
      metadata: { name: pkg.name, price: pkg.price, months: pkg.months },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Package created", data: { package: pkg } }, 201);
  },
);

/**
 * GET /api/admin/packages
 * query: status, search, page, limit
 */
export const listPackages = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, search, page, limit } = req.query as any;

    const filter: any = {};
    if (status) {
      if (!PACKAGE_STATUSES.includes(status)) {
        throw new BadRequest(`status must be one of: ${PACKAGE_STATUSES.join(", ")}`);
      }
      filter.status = status;
    }

    if (search) {
      filter.name = new RegExp(escapeRegex(search), "i");
    }

    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const query = PackageModel.find(filter).sort({ createdAt: -1 });

    if (isPaginated) {
      query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [packages, total] = await Promise.all([
      query.lean(),
      PackageModel.countDocuments(filter),
    ]);

    SuccessResponse(res, {
      message: "Packages retrieved",
      data: {
        packages,
        total,
        page: isPaginated ? pageNum : 1,
        limit: isPaginated ? limitNum : total,
        totalPages: isPaginated ? Math.ceil(total / limitNum) : 1,
      },
    });
  },
);

/**
 * GET /api/admin/packages/:id
 */
export const getPackageById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid package id");
    }

    const pkg = await PackageModel.findById(id).lean();
    if (!pkg) throw new NotFound("Package not found");

    SuccessResponse(res, {
      message: "Package retrieved",
      data: { package: pkg },
    });
  },
);

/**
 * PATCH /api/admin/packages/:id
 * body: { name?, price?, months?, status?, discount? }
 */
export const updatePackage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid package id");
    }

    const pkg = await PackageModel.findById(id);
    if (!pkg) throw new NotFound("Package not found");

    const { name, price, months, status, discount } = req.body as any;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw new BadRequest("name cannot be empty");
      }
      pkg.name = name.trim();
    }

    if (price !== undefined) {
      if (Number(price) < 0 || isNaN(Number(price))) {
        throw new BadRequest("price must be a number >= 0");
      }
      pkg.price = Number(price);
    }

    if (months !== undefined) {
      if (Number(months) < 1 || !Number.isInteger(Number(months))) {
        throw new BadRequest("months must be an integer >= 1");
      }
      pkg.months = Number(months);
    }

    if (status !== undefined) {
      if (!PACKAGE_STATUSES.includes(status)) {
        throw new BadRequest(`status must be one of: ${PACKAGE_STATUSES.join(", ")}`);
      }
      pkg.status = status;
    }

    if (discount !== undefined) {
      if (Number(discount) < 0 || isNaN(Number(discount))) {
        throw new BadRequest("discount must be a number >= 0");
      }
      pkg.discount = Number(discount);
    }

    await pkg.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "package.update",
      targetType: "Package",
      targetId: pkg._id,
      metadata: { name: pkg.name, price: pkg.price, months: pkg.months, status: pkg.status },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Package updated",
      data: { package: pkg },
    });
  },
);

/**
 * DELETE /api/admin/packages/:id
 */
export const deletePackage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid package id");
    }

    const pkg = await PackageModel.findById(id);
    if (!pkg) throw new NotFound("Package not found");

    // تحقق من عدم وجود طلبات مرتبطة بالباقة
    const ordersCount = await OrderModel.countDocuments({ package_id: pkg._id });
    if (ordersCount > 0) {
      throw new BadRequest(
        `Cannot delete package. It is associated with ${ordersCount} order(s). Set status to inactive instead.`,
      );
    }

    await pkg.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "package.delete",
      targetType: "Package",
      targetId: pkg._id,
      metadata: { name: pkg.name },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Package deleted" });
  },
);
