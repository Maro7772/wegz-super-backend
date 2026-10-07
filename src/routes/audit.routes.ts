import { Router } from "express";
import { listAuditLogs, auditStats } from "../controllers/audit.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("audit:read"), listAuditLogs);
router.get("/stats", requirePermission("audit:read"), auditStats);

export default router;
