import { Router } from "express";
import {
  listPaymentMethods,
  getPaymentMethodById,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from "../controllers/paymentMethod.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("payment_methods:view"), listPaymentMethods);
router.post(
  "/",
  requirePermission("payment_methods:add"),
  upload.single("icon"),
  createPaymentMethod,
);
router.get("/:id", requirePermission("payment_methods:view"), getPaymentMethodById);
router.patch(
  "/:id",
  requirePermission("payment_methods:edit"),
  upload.single("icon"),
  updatePaymentMethod,
);
router.delete(
  "/:id",
  requirePermission("payment_methods:delete"),
  deletePaymentMethod,
);

export default router;
