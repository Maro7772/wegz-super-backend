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

router.get("/stats", requirePermission("sales:view"), getSalesStats);
router.get("/", requirePermission("sales:view"), listSales);
router.post("/", requirePermission("sales:add"), createSale);
router.get("/:id", requirePermission("sales:view"), getSaleById);
router.patch("/:id", requirePermission("sales:edit"), updateSale);
router.delete("/:id", requirePermission("sales:delete"), deleteSale);

export default router;
