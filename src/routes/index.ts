import { Router } from "express";
import authRoutes from "./auth.routes";
import superAdminRoutes from "./superAdmin.routes";
import packageRoutes from "./package.routes";
import clientRoutes from "./client.routes";
import tenantRoutes from "./tenant.routes";
import subscriptionRoutes from "./subscription.routes";
import auditRoutes from "./audit.routes";
import dashboardRoutes from "./dashboard.routes";

const router = Router();

// Auth
router.use("/auth", authRoutes);

// Super Admin management (admins + permissions)
router.use("/admin", superAdminRoutes);

// Packages
router.use("/admin/packages", packageRoutes);

// Clients
router.use("/admin/clients", clientRoutes);

// Subscriptions
router.use("/admin/subscriptions", subscriptionRoutes);

// Audit
router.use("/admin/audit", auditRoutes);

// Dashboard
router.use("/admin/dashboard", dashboardRoutes);

// Tenant (called by client backend)
router.use("/tenant", tenantRoutes);

export default router;
