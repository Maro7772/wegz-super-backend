import { Router } from "express";
import {
  listPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
} from "../controllers/package.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("packages:view"), listPackages);
router.post("/", requirePermission("packages:add"), createPackage);
router.get("/:id", requirePermission("packages:view"), getPackageById);
router.patch("/:id", requirePermission("packages:edit"), updatePackage);
router.delete("/:id", requirePermission("packages:delete"), deletePackage);

export default router;
