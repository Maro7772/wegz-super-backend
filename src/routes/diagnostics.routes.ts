import { Router } from "express";
import { mongoDiagnostics } from "../controllers/diagnostics.controller";
import { migrateFromAtlas } from "../controllers/migration.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);
router.get("/mongo", mongoDiagnostics);
router.post("/migrate-from-atlas", migrateFromAtlas);

export default router;
