import { Router } from "express";
import {
  getFinancialSummary,
  getMonthlyRevenue,
  getRevenueByCategory,
  getRevenueBySalesAgent,
  getPendingPaymentsReport,
} from "../controllers/financialReport.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);
router.use(requirePermission("financial_reports:read"));

router.get("/summary", getFinancialSummary);
router.get("/monthly", getMonthlyRevenue);
router.get("/by-category", getRevenueByCategory);
router.get("/by-sales-agent", getRevenueBySalesAgent);
router.get("/pending", getPendingPaymentsReport);

export default router;
