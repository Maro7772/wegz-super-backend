import { Router } from "express";
import {
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
  getProvisioningStatus,
  regenerateApiKey,
  suspendClient,
  activateClient,
  rebuildFrontend,
  getClientLogs,
  resetTenantAdminPassword,
  installClientSsl,
  deleteClientFull,
  getProvisioningLogs,
} from "../controllers/client.controller";
import { clientSubRoutes } from "./subscription.routes";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// ---- Basic CRUD ----
router.get("/", requirePermission("clients:read"), listClients);
router.post("/", requirePermission("clients:create"), createClient);
router.get("/:id", requirePermission("clients:read"), getClientById);
router.patch("/:id", requirePermission("clients:update"), updateClient);
router.delete("/:id", requirePermission("clients:delete"), deleteClient);

// ---- Provisioning ----
router.get(
  "/:id/provisioning-status",
  requirePermission("clients:read"),
  getProvisioningStatus,
);
router.get(
  "/:id/provisioning-logs",
  requirePermission("clients:read"),
  getProvisioningLogs,
);

// ---- API Key ----
router.post(
  "/:id/regenerate-api-key",
  requirePermission("clients:update"),
  regenerateApiKey,
);

// ---- Lifecycle ----
router.post("/:id/suspend", requirePermission("clients:update"), suspendClient);
router.post(
  "/:id/activate",
  requirePermission("clients:update"),
  activateClient,
);

// ---- Rebuild & deploy ----
router.post(
  "/:id/rebuild-frontend",
  requirePermission("clients:update"),
  rebuildFrontend,
);

// ---- Logs & diagnostics ----
router.get("/:id/logs", requirePermission("clients:read"), getClientLogs);

// ---- Tenant admin ----
router.post(
  "/:id/reset-admin-password",
  requirePermission("clients:update"),
  resetTenantAdminPassword,
);

// ---- SSL ----
router.post(
  "/:id/ssl/install",
  requirePermission("clients:update"),
  installClientSsl,
);

// ---- Full delete ----
router.delete(
  "/:id/full",
  requirePermission("clients:delete"),
  deleteClientFull,
);

// ---- Subscriptions (nested) ----
router.use("/:id/subscriptions", clientSubRoutes);

export default router;
