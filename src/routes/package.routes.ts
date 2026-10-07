import { Router } from "express";
import {
  createPackage,
  listPackages,
  getPackageById,
  updatePackage,
  deletePackage,
} from "../controllers/package.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("packages:read"), listPackages);
router.post("/", requirePermission("packages:create"), createPackage);
router.get("/:id", requirePermission("packages:read"), getPackageById);
router.patch("/:id", requirePermission("packages:update"), updatePackage);
router.delete("/:id", requirePermission("packages:delete"), deletePackage);

export default router;
