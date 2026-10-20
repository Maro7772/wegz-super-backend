import { Router } from "express";
import {
  verifyTenant,
  submitTenantPayment,
  listTenantPayments,
} from "../controllers/tenant.controller";
import { tenantAuth } from "../middlewares/tenantAuth.middleware";

const router = Router();

router.get("/verify", tenantAuth, verifyTenant);

// Payments submitted by the tenant backend (appear as pending in Super)
router.post("/payments", tenantAuth, submitTenantPayment);
router.get("/payments", tenantAuth, listTenantPayments);

export default router;
