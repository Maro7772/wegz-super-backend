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

router.get("/", requirePermission("payments:read"), listPayments);
router.post("/", requirePermission("payments:create"), createPayment);
router.get("/:id", requirePermission("payments:read"), getPaymentById);
router.post(
  "/:id/approve",
  requirePermission("payments:approve"),
  approvePayment,
);
router.post(
  "/:id/reject",
  requirePermission("payments:approve"),
  rejectPayment,
);
router.delete("/:id", requirePermission("payments:delete"), deletePayment);

export default router;
