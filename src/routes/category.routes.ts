import { Router } from "express";
import {
  listCategories,
  getCategoriesTree,
  getCategoryById,
  createCategory,
  createSubcategory,
  listSubcategories,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// Tree / list
router.get("/tree", requirePermission("categories:read"), getCategoriesTree);
router.get("/", requirePermission("categories:read"), listCategories);

// Create
router.post("/", requirePermission("categories:create"), createCategory);

// Single category
router.get("/:id", requirePermission("categories:read"), getCategoryById);
router.patch("/:id", requirePermission("categories:update"), updateCategory);
router.delete("/:id", requirePermission("categories:delete"), deleteCategory);

// Subcategories
router.get(
  "/:id/subcategories",
  requirePermission("categories:read"),
  listSubcategories,
);
router.post(
  "/:id/subcategories",
  requirePermission("categories:create"),
  createSubcategory,
);

export default router;
