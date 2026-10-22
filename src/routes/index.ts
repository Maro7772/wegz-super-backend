import { Router } from "express";
import authRoutes from "./auth.routes";
import superAdminRoutes from "./superAdmin.routes";
import sectionRoutes from "./section.routes";
import clientRoutes from "./client.routes";
import saleRoutes from "./sale.routes";
import paymentRoutes from "./payment.routes";
import reportRoutes from "./report.routes";
import financialReportRoutes from "./financialReport.routes";
import tenantRoutes from "./tenant.routes";
import auditRoutes from "./audit.routes";
import dashboardRoutes from "./dashboard.routes";
import diagnosticsRoutes from "./diagnostics.routes";

const router = Router();

// Auth
router.use("/auth", authRoutes);

// Super Admin management (admins + permissions)
router.use("/admin", superAdminRoutes);

// Sections (بدل Categories/Subcategories)
router.use("/admin/sections", sectionRoutes);

// Clients
router.use("/admin/clients", clientRoutes);

// Sales
router.use("/admin/sales", saleRoutes);

// Payments
router.use("/admin/payments", paymentRoutes);

// Operation reports
router.use("/admin/reports", reportRoutes);

// Financial reports
router.use("/admin/financial-reports", financialReportRoutes);

// Audit
router.use("/admin/audit", auditRoutes);

// Dashboard
router.use("/admin/dashboard", dashboardRoutes);

// Diagnostics (root only)
router.use("/admin/diagnostics", diagnosticsRoutes);

// Tenant (called by client backend)
router.use("/tenant", tenantRoutes);

export default router;
