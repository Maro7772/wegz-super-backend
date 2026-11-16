import { Router } from "express";
import {
  listOrders,
  getOrderById,
  getOrderLists,
  createOrder,
  updateOrder,
  deleteOrder,
  approveOrder,
  rejectOrder,
} from "../controllers/order.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.use(authenticate);

// Lists for order form dropdowns (must be defined before /:id)
router.get("/lists", requirePermission("orders:view"), getOrderLists);

// List orders (view_orders) & add order
router.get("/", requirePermission("orders:view"), listOrders);
router.post(
  "/",
  requirePermission("orders:add"),
  upload.single("receipt"),
  createOrder,
);

// Specific order actions
router.post("/:id/approve", requirePermission("orders:edit"), approveOrder);
router.post("/:id/reject", requirePermission("orders:edit"), rejectOrder);

// Single order CRUD
router.get("/:id", requirePermission("orders:view"), getOrderById);
router.patch(
  "/:id",
  requirePermission("orders:edit"),
  upload.single("receipt"),
  updateOrder,
);
router.delete("/:id", requirePermission("orders:delete"), deleteOrder);

export default router;
