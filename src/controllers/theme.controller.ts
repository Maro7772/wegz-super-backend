import type { Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ThemeModel, AVAILABLE_MODES, type ModeKey } from "../models/Theme";
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
      .replace(/^-+|-+$/g, "") || "theme"
  );
}

/**
 * GET /api/admin/themes
 * query: status?, search?
 */
export const listThemes = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, search } = req.query as any;

    const filter: any = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { key: regex }, { description: regex }];
    }

    const themes = await ThemeModel.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    SuccessResponse(res, {
      message: "Themes retrieved",
      data: { themes, total: themes.length },
    });
  },
);

/**
 * GET /api/admin/themes/:id
 */
export const getThemeById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid theme id");
    }

    const theme = await ThemeModel.findById(id);
    if (!theme) throw new NotFound("Theme not found");

    SuccessResponse(res, {
      message: "Theme retrieved",
      data: { theme },
    });
  },
);

/**
 * POST /api/admin/themes
 * body: { name, key?, description?, preview_image?, status?, availableModes?, defaultMode?, order? }
 */
export const createTheme = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      name,
      key,
      description,
      preview_image,
      status,
      availableModes,
      defaultMode,
      order,
    } = req.body as any;

    if (!name || !String(name).trim()) {
      throw new BadRequest("name is required");
    }

    const finalKey = slugify(key ? String(key) : String(name));

    const exists = await ThemeModel.findOne({
      $or: [{ key: finalKey }, { name: String(name).trim() }],
    });
    if (exists) {
      throw new Conflict("Theme with this name or key already exists");
    }

    let finalOrder = order;
    if (finalOrder === undefined) {
      const last = await ThemeModel.findOne().sort({ order: -1 }).lean();
      finalOrder = last ? Number(last.order || 0) + 1 : 1;
    }

    const validModes: ModeKey[] = Array.isArray(availableModes) && availableModes.length > 0
      ? availableModes.filter((m: any) => AVAILABLE_MODES.includes(m))
      : ["dark", "light"];

    const chosenDefaultMode: ModeKey = defaultMode && AVAILABLE_MODES.includes(defaultMode)
      ? defaultMode
      : "light";

    const theme = await ThemeModel.create({
      name: String(name).trim(),
      key: finalKey,
      description: description ? String(description).trim() : "",
      preview_image: preview_image ? String(preview_image).trim() : "",
      status: status === "inactive" ? "inactive" : "active",
      availableModes: validModes,
      defaultMode: chosenDefaultMode,
      order: Number(finalOrder) || 0,
    });

    await logAudit({
      adminId: req.admin?.id,
      action: "theme.created",
      targetType: "Theme",
      targetId: theme._id,
      metadata: { key: theme.key, name: theme.name },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Theme created successfully",
      data: { theme },
      statusCode: 201,
    });
  },
);

/**
 * PATCH /api/admin/themes/:id
 */
export const updateTheme = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid theme id");
    }

    const theme = await ThemeModel.findById(id);
    if (!theme) throw new NotFound("Theme not found");

    const {
      name,
      key,
      description,
      preview_image,
      status,
      availableModes,
      defaultMode,
      order,
    } = req.body as any;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) throw new BadRequest("name cannot be empty");
      const conflict = await ThemeModel.findOne({
        _id: { $ne: theme._id },
        name: trimmed,
      });
      if (conflict) throw new Conflict("Theme name already exists");
      theme.name = trimmed;
    }

    if (key !== undefined) {
      const finalKey = slugify(String(key));
      const conflict = await ThemeModel.findOne({
        _id: { $ne: theme._id },
        key: finalKey,
      });
      if (conflict) throw new Conflict("Theme key already exists");
      theme.key = finalKey;
    }

    if (description !== undefined) theme.description = String(description).trim();
    if (preview_image !== undefined) theme.preview_image = String(preview_image).trim();
    if (status !== undefined && ["active", "inactive"].includes(status)) {
      theme.status = status;
    }
    if (Array.isArray(availableModes)) {
      theme.availableModes = availableModes.filter((m: any) =>
        AVAILABLE_MODES.includes(m),
      );
    }
    if (defaultMode !== undefined && AVAILABLE_MODES.includes(defaultMode)) {
      theme.defaultMode = defaultMode;
    }
    if (order !== undefined) theme.order = Number(order) || 0;

    await theme.save();

    await logAudit({
      adminId: req.admin?.id,
      action: "theme.updated",
      targetType: "Theme",
      targetId: theme._id,
      metadata: { key: theme.key, name: theme.name },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Theme updated successfully",
      data: { theme },
    });
  },
);

/**
 * DELETE /api/admin/themes/:id
 */
export const deleteTheme = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest("Invalid theme id");
    }

    const theme = await ThemeModel.findById(id);
    if (!theme) throw new NotFound("Theme not found");

    await theme.deleteOne();

    await logAudit({
      adminId: req.admin?.id,
      action: "theme.deleted",
      targetType: "Theme",
      targetId: theme._id,
      metadata: { key: theme.key, name: theme.name },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Theme deleted successfully",
      data: null,
    });
  },
);
