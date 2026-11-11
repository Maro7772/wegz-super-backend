import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import {
  runAllTenantMigrations,
  getTenantMigrationsStatus,
} from "../services/tenantMigration.service";

/**
 * GET /api/admin/migrations/status
 * يعرض حالة الميجريشنز لكل العملاء (المطبقة والمعلقة)
 */
export const getMigrationStatusHandler = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const status = await getTenantMigrationsStatus();

    SuccessResponse(res, {
      message: "Tenant migrations status retrieved",
      data: status,
    });
  },
);

/**
 * POST /api/admin/migrations/run
 * يشغل التعديلات الجديدة فقط عبر جميع العملاء أو عميل محدد
 * body: { tenantId?: string, subdomain?: string, dryRun?: boolean }
 */
export const runMigrationsHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { tenantId, subdomain, dryRun } = req.body || {};

    const report = await runAllTenantMigrations({
      tenantId: tenantId ? String(tenantId) : undefined,
      subdomain: subdomain ? String(subdomain) : undefined,
      dryRun: Boolean(dryRun),
    });

    await logAudit({
      adminId: req.admin!.id,
      action: dryRun ? "migration.dry_run" : "migration.run",
      targetType: "TenantSchemas",
      metadata: {
        totalTenants: report.totalTenants,
        migratedCount: report.migratedCount,
        newApplied: report.totalNewMigrationsApplied,
        failedCount: report.failedCount,
        dryRun: Boolean(dryRun),
      },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      {
        message: dryRun
          ? "Migration dry-run completed (no changes applied)"
          : `Migration completed: ${report.migratedCount} tenants updated, ${report.alreadyUpToDateCount} were already up to date.`,
        data: report,
      },
      report.failedCount > 0 ? 207 : 200,
    );
  },
);
