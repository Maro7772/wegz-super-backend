import { Router } from "express";
import {
  getOperationReports,
  getOperationReportById,
  addOperationNote,
  deleteOperationNote,
  updateOperationStatus,
  getClientsReport,
} from "../controllers/report.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// Operation reports
router.get(
  "/operations",
  requirePermission("reports:read"),
  getOperationReports,
);
router.get(
  "/operations/:id",
  requirePermission("reports:read"),
  getOperationReportById,
);
router.patch(
  "/operations/:id/status",
  requirePermission("reports:read"),
  updateOperationStatus,
);
router.post(
  "/operations/:id/notes",
  requirePermission("reports:read"),
  addOperationNote,
);
router.delete(
  "/operations/:id/notes/:noteIndex",
  requirePermission("reports:read"),
  deleteOperationNote,
);

// Clients summary
router.get("/clients", requirePermission("reports:read"), getClientsReport);

export default router;
