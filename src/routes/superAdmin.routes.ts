import { Router } from "express";
import {
  createSuperAdmin,
  listSuperAdmins,
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin,
  assignAdminRole,
} from "../controllers/superAdmin.controller";
import {
  listAvailablePermissions,
  getAdminPermissions,
  updateAdminPermissions,
} from "../controllers/permissions.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// ---- Super Admins CRUD ----
router.get("/admins", requirePermission("admins:view"), listSuperAdmins);
router.post("/admins", requirePermission("admins:add"), createSuperAdmin);
router.get("/admins/:id", requirePermission("admins:view"), getSuperAdminById);
router.patch("/admins/:id", requirePermission("admins:edit"), updateSuperAdmin);
router.put(
  "/admins/:id/role",
  requirePermission("admins:edit"),
  assignAdminRole,
);
router.delete(
  "/admins/:id",
  requirePermission("admins:delete"),
  deleteSuperAdmin,
);

// ---- Permissions ----
router.get(
  "/permissions/catalog",
  requirePermission("admins:view"), // ← كتالوج = عرض
  listAvailablePermissions,
);
router.get(
  "/admins/:id/permissions",
  requirePermission("admins:view"),
  getAdminPermissions,
);
router.put(
  "/admins/:id/permissions",
  requirePermission("admins:edit"), // ← كان admins:update_permissions
  updateAdminPermissions,
);

export default router;
