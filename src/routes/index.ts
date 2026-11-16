import { Router } from "express";
import authRoutes from "./auth.routes";
import superAdminRoutes from "./superAdmin.routes";
import roleRoutes from "./role.routes";
import sectionRoutes from "./section.routes";
import themeRoutes from "./theme.routes";
import clientRoutes from "./client.routes";
import saleRoutes from "./sale.routes";
import paymentRoutes from "./payment.routes";
import reportRoutes from "./report.routes";
import financialReportRoutes from "./financialReport.routes";
import tenantRoutes from "./tenant.routes";
import auditRoutes from "./audit.routes";
import dashboardRoutes from "./dashboard.routes";
import diagnosticsRoutes from "./diagnostics.routes";
import tenantMigrationRoutes from "./tenantMigration.routes";
import customDomainRoutes from "./customDomain.routes";
import packageRoutes from "./package.routes";
import paymentMethodRoutes from "./paymentMethod.routes";
import orderRoutes from "./order.routes";

const router = Router();

// Auth
router.use("/auth", authRoutes);

// Super Admin management (admins + permissions)
router.use("/admin", superAdminRoutes);

// Roles (قوالب الصلاحيات — Cashier / Manager / ...)
router.use("/admin/roles", roleRoutes);

// Sections (بدل Categories/Subcategories)
router.use("/admin/sections", sectionRoutes);

// Themes (قوالب المتجر)
router.use("/admin/themes", themeRoutes);

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

// Migrations across all tenant schemas
router.use("/admin/migrations", tenantMigrationRoutes);

// Custom Domains management
router.use("/admin/custom-domains", customDomainRoutes);

// Packages
router.use("/admin/packages", packageRoutes);

// Payment Methods
router.use("/admin/payment-methods", paymentMethodRoutes);

// Orders
router.use("/admin/orders", orderRoutes);

// Tenant (called by client backend)
router.use("/tenant", tenantRoutes);

export default router;
