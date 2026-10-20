import type { Response } from "express";
import asyncHandler from "express-async-handler";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { BadRequest, ForbiddenError } from "../utils/errors";
import { SuccessResponse } from "../utils/response";

const execFileAsync = promisify(execFile);

/**
 * مصدر Atlas: من SOURCE_MONGO_URI، أو من السطر المشروح `# MONGO_URI=`
 * في .env (بنستخدمه وقت الترحيل فقط).
 */
function findSourceUri(): string | null {
  if (process.env.SOURCE_MONGO_URI) return process.env.SOURCE_MONGO_URI;

  try {
    const envText = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const match = envText.match(
      /^#\s*MONGO_URI=(mongodb(?:\+srv)?:\/\/.+)$/m,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/diagnostics/migrate-from-atlas
 * Root فقط + MIGRATION_ENABLED=true.
 * يشغّل scripts/migrate-to-plesk.cjs جوّه نفس بيئة التطبيق (Node موجود).
 */
export const migrateFromAtlas = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.admin?.is_root) {
      throw new ForbiddenError("Root admin only");
    }

    if (process.env.MIGRATION_ENABLED !== "true") {
      throw new ForbiddenError("Migration endpoint is disabled");
    }

    const sourceUri = findSourceUri();
    if (!sourceUri) {
      throw new BadRequest(
        "SOURCE_MONGO_URI not found. Add it to .env or keep the old Atlas URI as a commented `# MONGO_URI=` line.",
      );
    }

    const script = path.join(
      process.cwd(),
      "scripts",
      "migrate-to-plesk.cjs",
    );
    if (!fs.existsSync(script)) {
      throw new BadRequest("scripts/migrate-to-plesk.cjs not found");
    }

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SOURCE_MONGO_URI: sourceUri,
          CONFIRM: "YES",
          TARGET_DB: "SuperWegz",
        },
        timeout: 10 * 60 * 1000,
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    SuccessResponse(res, {
      message: "Migration finished",
      data: { stdout, stderr },
    });
  },
);
