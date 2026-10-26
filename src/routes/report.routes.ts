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
  requirePermission("reports:view"),
  getOperationReports,
);
router.get(
  "/operations/:id",
  requirePermission("reports:view"),
  getOperationReportById,
);
router.patch(
  "/operations/:id/status",
  requirePermission("reports:view"),
  updateOperationStatus,
);
router.post(
  "/operations/:id/notes",
  requirePermission("reports:view"),
  addOperationNote,
);
router.delete(
  "/operations/:id/notes/:noteIndex",
  requirePermission("reports:view"),
  deleteOperationNote,
);

// Clients summary
router.get("/clients", requirePermission("reports:view"), getClientsReport);

export default router;
