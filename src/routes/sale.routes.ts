import { Router } from "express";
import {
  createSale,
  listSales,
  getSalesStats,
  getSaleById,
  updateSale,
  deleteSale,
} from "../controllers/sale.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/stats", requirePermission("sales:read"), getSalesStats);
router.get("/", requirePermission("sales:read"), listSales);
router.post("/", requirePermission("sales:create"), createSale);
router.get("/:id", requirePermission("sales:read"), getSaleById);
router.patch("/:id", requirePermission("sales:update"), updateSale);
router.delete("/:id", requirePermission("sales:delete"), deleteSale);

export default router;
