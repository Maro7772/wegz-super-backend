import { Router } from "express";
import { verifyTenant } from "../controllers/tenant.controller";
import { tenantAuth } from "../middlewares/tenantAuth.middleware";

const router = Router();

router.get("/verify", tenantAuth, verifyTenant);

export default router;
