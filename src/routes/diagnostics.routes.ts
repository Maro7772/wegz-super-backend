import { Router } from "express";
import { mongoDiagnostics } from "../controllers/diagnostics.controller";
import { migrateFromAtlas } from "../controllers/migration.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// حاليًا الكونترولر بيتحقق من is_root، بس نضيف permission للوضوح
router.get("/mongo", requirePermission("provisioning:add"), mongoDiagnostics);
router.post(
  "/migrate-from-atlas",
  requirePermission("provisioning:add"),
  migrateFromAtlas,
);

export default router;
