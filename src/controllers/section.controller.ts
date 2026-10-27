import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SectionModel } from "../models/Section";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import { escapeRegex } from "../utils/regex";

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** جلب عدد العملاء لكل سيكشن في طلب واحد */
async function getClientCountsBySection(): Promise<Record<string, number>> {
  const rows = await ClientModel.aggregate([
    { $unwind: "$sections" },
    { $group: { _id: "$sections", clients_count: { $sum: 1 } } },
  ]);

  return Object.fromEntries(
    rows.map((row) => [String(row._id), Number(row.clients_count) || 0]),
  );
}

/**
 * GET /api/admin/sections
 * query: status?, search?, with_counts=true
 */
export const listSections = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, search, with_counts } = req.query as any;

    const filter: any = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { ar_name: regex }, { key: regex }];
    }

    const sections = await SectionModel.find(filter)
      .sort({ order: 1, name: 1 })
      .lean();

    const includeCounts = ["true", "1", true].includes(with_counts as any);
    const counts = includeCounts ? await getClientCountsBySection() : {};

    const data = sections.map((section: any) => ({
      ...section,
      clients_count: counts[String(section._id)] ?? 0,
    }));

    SuccessResponse(res, {
      message: "Sections retrieved",
      data: { sections: data, total: data.length },
    });
  },
);

/**
 * GET /api/admin/sections/:id
 * query: include_clients=true
 */
export const getSectionById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid section id");
    }

    const section = await SectionModel.findById(id);
    if (!section) throw new NotFound("Section not found");

    const clientsCount = await ClientModel.countDocuments({ sections: section._id });

    const { include_clients } = req.query as any;
    const includeClients = ["true", "1", true].includes(include_clients as any);

    const clients = includeClients
      ? await ClientModel.find({ sections: section._id })
          .select("company_name email subdomain status operation_status")
          .sort({ company_name: 1 })
          .lean()
      : undefined;

    SuccessResponse(res, {
      message: "Section retrieved",
      data: {
        section,
        clients_count: clientsCount,
        ...(clients ? { clients } : {}),
      },
    });
  },
);

/**
 * GET /api/admin/sections/:id/clients
 */
export const listSectionClients = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid section id");
    }

    const section = await SectionModel.findById(id).lean();
    if (!section) throw new NotFound("Section not found");

    const clients = await ClientModel.find({ sections: id })
      .select("company_name email subdomain status operation_status sections")
      .populate("sections", "key name ar_name")
      .sort({ company_name: 1 });

    SuccessResponse(res, {
      message: "Section clients retrieved",
      data: { section, clients, count: clients.length },
    });
  },
);

/**
 * POST /api/admin/sections
 * body: { name, key?, ar_name?, description?, icon?, status?, order? }
 */
export const createSection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, key, ar_name, description, icon, status, order } =
      req.body as any;

    if (!name || !String(name).trim()) {
      throw new BadRequest("name is required");
    }

    const finalKey = slugify(key ? String(key) : String(name));

    const exists = await SectionModel.findOne({ key: finalKey });
    if (exists) throw new Conflict("Section key already exists");

    let finalOrder = order;
    if (finalOrder === undefined) {
      const last = await SectionModel.findOne().sort({ order: -1 }).lean();
      finalOrder = (last?.order ?? 0) + 1;
    }

    const section = await SectionModel.create({
      key: finalKey,
      name: String(name).trim(),
      ar_name: ar_name ? String(ar_name).trim() : undefined,
      description,
      icon,
      status: status ?? "active",
      order: Number(finalOrder) || 0,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "section.create",
      targetType: "Section",
      targetId: section._id,
      metadata: { key: section.key, name: section.name },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Section created", data: { section } }, 201);
  },
);

/**
 * PATCH /api/admin/sections/:id
 */
export const updateSection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, key, ar_name, description, icon, status, order } =
      req.body as any;

    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid section id");
    }

    const section = await SectionModel.findById(id);
    if (!section) throw new NotFound("Section not found");

    if (key !== undefined && String(key).trim()) {
      const finalKey = slugify(String(key));
      const duplicate = await SectionModel.findOne({
        _id: { $ne: section._id },
        key: finalKey,
      });
      if (duplicate) throw new Conflict("Section key already exists");
      section.key = finalKey;
    }

    if (name !== undefined) {
      if (!String(name).trim()) throw new BadRequest("name cannot be empty");
      section.name = String(name).trim();
    }
    if (ar_name !== undefined) {
      section.set("ar_name", ar_name ? String(ar_name).trim() : undefined);
    }
    if (description !== undefined) section.description = description;
    if (icon !== undefined) section.icon = icon;
    if (status !== undefined) section.status = status;
    if (order !== undefined) section.order = Number(order) || 0;

    await section.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "section.update",
      targetType: "Section",
      targetId: section._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Section updated", data: { section } });
  },
);

/**
 * DELETE /api/admin/sections/:id
 * query: force=true

 * - لو السيكشن مستخدم في عملاء: بيمنع الحذف إلا بـ force=true.
 * - force=true يشيل السيكشن من كل العملاء الأول ثم يحذفه.
 */
export const deleteSection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid section id");
    }

    const section = await SectionModel.findById(id);
    if (!section) throw new NotFound("Section not found");

    const used = await ClientModel.countDocuments({ sections: section._id });
    const force = ["true", "1", true].includes((req.query as any).force);

    if (used > 0 && !force) {
      throw new Conflict(
        `Section is used by ${used} client(s). Pass force=true to remove it from them.`,
      );
    }

    if (used > 0) {
      await ClientModel.updateMany(
        { sections: section._id },
        { $pull: { sections: section._id } },
      );
    }

    await section.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "section.delete",
      targetType: "Section",
      targetId: section._id,
      metadata: { key: section.key, name: section.name, clients_affected: used },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Section deleted",
      data: { clients_affected: used },
    });
  },
);
