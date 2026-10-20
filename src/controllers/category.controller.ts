import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { CategoryModel } from "../models/Category";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";

function slugify(input: string): string | undefined {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
}

/**
 * GET /api/admin/categories
 * query: status, parent_id, search, tree=true
 */
export const listCategories = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, parent_id, search, tree } = req.query as any;

    const filter: any = {};
    if (status) filter.status = status;
    if (parent_id === "root" || parent_id === "null") filter.parent_id = null;
    else if (parent_id) filter.parent_id = parent_id;
    if (search) filter.name = new RegExp(String(search), "i");

    const categories = await CategoryModel.find(filter)
      .sort({ order: 1, name: 1 })
      .lean();

    if (tree === "true" || tree === "1") {
      const roots = categories.filter((c: any) => !c.parent_id);
      const children = categories.filter((c: any) => !!c.parent_id);
      const result = roots.map((root: any) => ({
        ...root,
        subcategories: children.filter(
          (child: any) => String(child.parent_id) === String(root._id),
        ),
      }));
      SuccessResponse(res, {
        message: "Categories tree retrieved",
        data: { categories: result },
      });
      return;
    }

    SuccessResponse(res, {
      message: "Categories retrieved",
      data: { categories },
    });
  },
);

/**
 * GET /api/admin/categories/tree
 */
export const getCategoriesTree = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const categories = await CategoryModel.find().sort({ order: 1, name: 1 }).lean();
    const roots = categories.filter((c: any) => !c.parent_id);
    const children = categories.filter((c: any) => !!c.parent_id);

    const result = roots.map((root: any) => ({
      ...root,
      subcategories: children.filter(
        (child: any) => String(child.parent_id) === String(root._id),
      ),
    }));

    SuccessResponse(res, {
      message: "Categories tree retrieved",
      data: { categories: result },
    });
  },
);

/**
 * GET /api/admin/categories/:id
 */
export const getCategoryById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const category = await CategoryModel.findById(req.params.id).populate(
      "parent_id",
      "name slug",
    );
    if (!category) throw new NotFound("Category not found");

    const [subcategories, clientsCount] = await Promise.all([
      CategoryModel.find({ parent_id: category._id }).sort({ order: 1, name: 1 }),
      ClientModel.countDocuments({
        $or: [
          { category_id: category._id },
          { subcategory_id: category._id },
        ],
      }),
    ]);

    SuccessResponse(res, {
      message: "Category retrieved",
      data: { category, subcategories, clients_count: clientsCount },
    });
  },
);

/**
 * POST /api/admin/categories
 * body: { name, description?, parent_id?, status?, order?, slug? }
 */
async function createCategoryHandler(req: AuthRequest, res: Response) {
  const { name, description, parent_id, status, order, slug } = req.body as any;

  if (!name || !String(name).trim()) throw new BadRequest("name is required");

  let parent: any = null;
  if (parent_id) {
    parent = await CategoryModel.findById(parent_id);
    if (!parent) throw new NotFound("Parent category not found");
    if (parent.parent_id) {
      throw new BadRequest(
        "Subcategories cannot have subcategories (max 2 levels)",
      );
    }
  }

  const duplicate = await CategoryModel.findOne({
    name: String(name).trim(),
    parent_id: parent?._id ?? null,
  });
  if (duplicate) throw new Conflict("Category name already exists at this level");

  const category = await CategoryModel.create({
    name: String(name).trim(),
    slug: slug ? slugify(slug) : slugify(String(name)),
    description,
    parent_id: parent?._id ?? null,
    status: status ?? "active",
    order: order ?? 0,
  });

  await logAudit({
    adminId: req.admin!.id,
    action: parent ? "subcategory.create" : "category.create",
    targetType: "Category",
    targetId: category._id,
    metadata: { name: category.name, parent_id: parent?._id ?? null },
    ip: req.ip,
  });

  SuccessResponse(res, { message: "Category created", data: { category } }, 201);
}

export const createCategory = asyncHandler(createCategoryHandler);

/**
 * POST /api/admin/categories/:id/subcategories
 */
export const createSubcategory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    req.body = { ...req.body, parent_id: req.params.id };
    await createCategoryHandler(req, res);
  },
);

/**
 * GET /api/admin/categories/:id/subcategories
 */
export const listSubcategories = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const parent = await CategoryModel.findById(req.params.id);
    if (!parent) throw new NotFound("Category not found");

    const subcategories = await CategoryModel.find({ parent_id: parent._id }).sort({
      order: 1,
      name: 1,
    });

    SuccessResponse(res, {
      message: "Subcategories retrieved",
      data: { category: { _id: parent._id, name: parent.name }, subcategories },
    });
  },
);

/**
 * PATCH /api/admin/categories/:id
 */
export const updateCategory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, description, parent_id, status, order, slug } = req.body as any;

    const category = await CategoryModel.findById(req.params.id);
    if (!category) throw new NotFound("Category not found");

    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === "" || parent_id === "null") {
        category.parent_id = null;
      } else {
        if (String(parent_id) === String(category._id)) {
          throw new BadRequest("Category cannot be its own parent");
        }
        const parent = await CategoryModel.findById(parent_id);
        if (!parent) throw new NotFound("Parent category not found");
        if (parent.parent_id) {
          throw new BadRequest(
            "Subcategories cannot have subcategories (max 2 levels)",
          );
        }
        const hasChildren = await CategoryModel.exists({
          parent_id: category._id,
        });
        if (hasChildren) {
          throw new BadRequest(
            "Cannot move a parent category under another category",
          );
        }
        category.parent_id = parent._id;
      }
    }

    if (name !== undefined) category.name = String(name).trim();
    if (description !== undefined) category.description = description;
    if (status !== undefined) category.status = status;
    if (order !== undefined) category.order = Number(order) || 0;
    if (slug !== undefined) category.slug = slug ? slugify(slug) : undefined;

    const duplicate = await CategoryModel.findOne({
      _id: { $ne: category._id },
      name: category.name,
      parent_id: category.parent_id ?? null,
    });
    if (duplicate) throw new Conflict("Category name already exists at this level");

    await category.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "category.update",
      targetType: "Category",
      targetId: category._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Category updated",
      data: { category },
    });
  },
);

/**
 * DELETE /api/admin/categories/:id
 */
export const deleteCategory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const category = await CategoryModel.findById(req.params.id);
    if (!category) throw new NotFound("Category not found");

    const children = await CategoryModel.countDocuments({
      parent_id: category._id,
    });
    if (children > 0) {
      throw new Conflict("Delete subcategories first");
    }

    const used = await ClientModel.countDocuments({
      $or: [{ category_id: category._id }, { subcategory_id: category._id }],
    });
    if (used > 0) {
      throw new Conflict(
        `Category is used by ${used} client(s). Reassign them first.`,
      );
    }

    await category.deleteOne();

    await logAudit({
      adminId: req.admin!.id,
      action: "category.delete",
      targetType: "Category",
      targetId: category._id,
      metadata: { name: category.name },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Category deleted" });
  },
);
