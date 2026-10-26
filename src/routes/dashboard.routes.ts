import { Router } from "express";
import { getDashboardStats } from "../controllers/dashboard.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);
router.get("/", requirePermission("dashboard:view"), getDashboardStats);

export default router;
