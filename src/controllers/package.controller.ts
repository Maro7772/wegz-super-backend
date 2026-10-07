import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { PackageModel } from "../models/Package";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

/**
 * POST /api/admin/packages
 */
export const createPackage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      name,
      description,
      monthly_price,
      quarterly_price,
      half_yearly_price,
      yearly_price,
      status,
      features,
    } = req.body;

    if (!name) throw new BadRequest("name is required");

    const exists = await PackageModel.findOne({ name });
    if (exists) throw new Conflict("Package name already exists");

    const pkg = await PackageModel.create({
      name,
      description,
      monthly_price: monthly_price ?? 0,
      quarterly_price: quarterly_price ?? 0,
      half_yearly_price: half_yearly_price ?? 0,
      yearly_price: yearly_price ?? 0,
      status: status ?? true,
      features: features ?? {},
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "package.create",
      targetType: "Package",
      targetId: pkg._id,
      metadata: { name: pkg.name },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      { message: "Package created", data: { package: pkg } },
      201,
    );
  },
);

/**
 * GET /api/admin/packages
 */
export const listPackages = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const packages = await PackageModel.find().sort({ createdAt: -1 });
    SuccessResponse(res, {
      message: "Packages retrieved",
      data: { packages },
    });
  },
);

/**
 * GET /api/admin/packages/:id
 */
export const getPackageById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const pkg = await PackageModel.findById(req.params.id);
    if (!pkg) throw new NotFound("Package not found");
    SuccessResponse(res, {
      message: "Package retrieved",
      data: { package: pkg },
    });
  },
);

/**
 * PATCH /api/admin/packages/:id
 */
export const updatePackage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, ...rest } = req.body;

    const pkg = await PackageModel.findById(req.params.id);
    if (!pkg) throw new NotFound("Package not found");

    if (name && name !== pkg.name) {
      const exists = await PackageModel.findOne({ name });
      if (exists) throw new Conflict("Package name already exists");
      pkg.name = name;
    }

    Object.assign(pkg, rest);
    await pkg.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "package.update",
      targetType: "Package",
      targetId: pkg._id,
      metadata: { changed: Object.keys(req.body) },
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
    const pkg = await PackageModel.findById(req.params.id);
    if (!pkg) throw new NotFound("Package not found");

    await PackageModel.findByIdAndDelete(pkg._id);

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
