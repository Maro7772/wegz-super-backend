import { Router } from "express";
import {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} from "../controllers/role.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// أدوار السوبر أدمن — بتستخدم نفس صلاحيات إدارة المشرفين (admins:*)
router.get("/", requirePermission("admins:view"), listRoles);
router.post("/", requirePermission("admins:add"), createRole);
router.get("/:id", requirePermission("admins:view"), getRoleById);
router.patch("/:id", requirePermission("admins:edit"), updateRole);
router.delete("/:id", requirePermission("admins:delete"), deleteRole);

export default router;
