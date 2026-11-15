import { Router } from "express";
import {
  listThemes,
  getThemeById,
  createTheme,
  updateTheme,
  deleteTheme,
} from "../controllers/theme.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// List / create
router.get("/", requirePermission("themes:view"), listThemes);
router.post("/", requirePermission("themes:add"), createTheme);

// Single theme
router.get("/:id", requirePermission("themes:view"), getThemeById);
router.patch("/:id", requirePermission("themes:edit"), updateTheme);
router.delete("/:id", requirePermission("themes:delete"), deleteTheme);

export default router;
