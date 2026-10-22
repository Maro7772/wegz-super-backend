import { Router } from "express";
import {
  listSections,
  getSectionById,
  listSectionClients,
  createSection,
  updateSection,
  deleteSection,
} from "../controllers/section.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// List / create
router.get("/", requirePermission("sections:read"), listSections);
router.post("/", requirePermission("sections:create"), createSection);

// Clients of a section (before /:id to avoid conflicts)
router.get(
  "/:id/clients",
  requirePermission("sections:read"),
  listSectionClients,
);

// Single section
router.get("/:id", requirePermission("sections:read"), getSectionById);
router.patch("/:id", requirePermission("sections:update"), updateSection);
router.delete("/:id", requirePermission("sections:delete"), deleteSection);

export default router;
