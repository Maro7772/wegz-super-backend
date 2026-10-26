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
router.get("/", requirePermission("sections:view"), listSections);
router.post("/", requirePermission("sections:add"), createSection);

// Clients of a section (before /:id to avoid conflicts)
router.get(
  "/:id/clients",
  requirePermission("sections:view"),
  listSectionClients,
);

// Single section
router.get("/:id", requirePermission("sections:view"), getSectionById);
router.patch("/:id", requirePermission("sections:edit"), updateSection);
router.delete("/:id", requirePermission("sections:delete"), deleteSection);

export default router;
