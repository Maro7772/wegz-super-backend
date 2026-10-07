import { Router } from "express";
import {
  listSubscriptions,
  getSubscriptionById,
  listClientSubscriptions,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  deleteSubscription,
} from "../controllers/subscription.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("subscriptions:read"), listSubscriptions);
router.get(
  "/:id",
  requirePermission("subscriptions:read"),
  getSubscriptionById,
);
router.patch(
  "/:id",
  requirePermission("subscriptions:update"),
  updateSubscription,
);
router.post(
  "/:id/cancel",
  requirePermission("subscriptions:update"),
  cancelSubscription,
);
router.delete(
  "/:id",
  requirePermission("subscriptions:update"),
  deleteSubscription,
);

// Nested under client — نستخدمها في client.routes.ts
export const clientSubRoutes = Router({ mergeParams: true });
clientSubRoutes.use(authenticate);
clientSubRoutes.get(
  "/",
  requirePermission("subscriptions:read"),
  listClientSubscriptions,
);
clientSubRoutes.post(
  "/",
  requirePermission("subscriptions:update"),
  createSubscription,
);

export default router;
