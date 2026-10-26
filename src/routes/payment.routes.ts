import { Router } from "express";
import {
  createPayment,
  listPayments,
  getPaymentById,
  approvePayment,
  rejectPayment,
  deletePayment,
} from "../controllers/payment.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("payments:view"), listPayments);
router.post("/", requirePermission("payments:add"), createPayment);
router.get("/:id", requirePermission("payments:view"), getPaymentById);
router.post(
  "/:id/approve",
  requirePermission("payments:edit"), // ← كان payments:approve
  approvePayment,
);
router.post(
  "/:id/reject",
  requirePermission("payments:edit"), // ← كان payments:approve
  rejectPayment,
);
router.delete("/:id", requirePermission("payments:delete"), deletePayment);

export default router;
