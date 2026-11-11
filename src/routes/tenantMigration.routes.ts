import { Router } from "express";
import {
  getMigrationStatusHandler,
  runMigrationsHandler,
} from "../controllers/tenantMigration.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// عرض حالة الميجريشنز لجميع العملاء
router.get("/status", requirePermission("clients:view"), getMigrationStatusHandler);

// تشغيل التعديلات الجديدة فقط عبر جميع العملاء
router.post("/run", requirePermission("clients:edit"), runMigrationsHandler);

export default router;
