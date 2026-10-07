import { Router } from "express";
import {
  createSuperAdmin,
  listSuperAdmins,
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin,
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
router.get("/admins", requirePermission("admins:read"), listSuperAdmins);
router.post("/admins", requirePermission("admins:create"), createSuperAdmin);
router.get("/admins/:id", requirePermission("admins:read"), getSuperAdminById);
router.patch(
  "/admins/:id",
  requirePermission("admins:update"),
  updateSuperAdmin,
);
router.delete(
  "/admins/:id",
  requirePermission("admins:delete"),
  deleteSuperAdmin,
);

// ---- Permissions ----
router.get(
  "/permissions/catalog",
  requirePermission("admins:read"),
  listAvailablePermissions,
);
router.get(
  "/admins/:id/permissions",
  requirePermission("admins:read"),
  getAdminPermissions,
);
router.put(
  "/admins/:id/permissions",
  requirePermission("admins:update_permissions"),
  updateAdminPermissions,
);

export default router;
