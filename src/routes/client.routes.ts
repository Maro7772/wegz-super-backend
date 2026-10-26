import { Router } from "express";
import {
  createClient,
  listClients,
  getClientById,
  updateClient,
  getClientSections,
  setClientSections,
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
  retryProvisioning,
} from "../controllers/client.controller";
import { provisionNow } from "../controllers/provision.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// ---- Basic CRUD ----
router.get("/", requirePermission("clients:view"), listClients);
router.post("/", requirePermission("clients:add"), createClient);
router.get("/:id", requirePermission("clients:view"), getClientById);
router.patch("/:id", requirePermission("clients:edit"), updateClient);

// ---- Sections assigned to a client ----
router.get(
  "/:id/sections",
  requirePermission("clients:view"),
  getClientSections,
);
router.put(
  "/:id/sections",
  requirePermission("clients:edit"),
  setClientSections,
);

router.delete("/:id", requirePermission("clients:delete"), deleteClient);

// ---- Provisioning ----
router.get(
  "/:id/provisioning-status",
  requirePermission("clients:view"),
  getProvisioningStatus,
);
router.post(
  "/:id/retry-provisioning",
  requirePermission("provisioning:add"), // ← retry = تشغيل provisioning
  retryProvisioning,
);
router.post(
  "/:id/provision-now",
  requirePermission("provisioning:add"), // ← كان provisioning:run
  provisionNow,
);

// ---- API Key ----
router.post(
  "/:id/regenerate-api-key",
  requirePermission("clients:edit"),
  regenerateApiKey,
);

// ---- Lifecycle ----
router.post("/:id/suspend", requirePermission("clients:edit"), suspendClient);
router.post("/:id/activate", requirePermission("clients:edit"), activateClient);

// ---- Rebuild & deploy ----
router.post(
  "/:id/rebuild-frontend",
  requirePermission("clients:edit"),
  rebuildFrontend,
);

// ---- Logs & diagnostics ----
router.get("/:id/logs", requirePermission("clients:view"), getClientLogs);

// ---- Tenant admin ----
router.post(
  "/:id/reset-admin-password",
  requirePermission("clients:edit"),
  resetTenantAdminPassword,
);

// ---- SSL ----
router.post(
  "/:id/ssl/install",
  requirePermission("clients:edit"),
  installClientSsl,
);

// ---- Full delete ----
router.delete(
  "/:id/full",
  requirePermission("clients:delete"),
  deleteClientFull,
);

export default router;
