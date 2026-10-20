import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { getTenantClusterConnection } from "../config/tenantDb";
import { env } from "../config/env";
import { ForbiddenError } from "../utils/errors";
import { SuccessResponse } from "../utils/response";

/** يخفي username/password من الـ URI قبل إرجاعه. */
function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//***:***@");
}

/**
 * GET /api/admin/diagnostics/mongo
 * Root فقط — يتأكد إن Plesk MongoDB متاح، ويرجع قائمة الداتابيز.
 * مفيد بعد النشر للتأكد من PLESK_MONGO_URI من غير SSH.
 */
export const mongoDiagnostics = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.admin?.is_root) {
      throw new ForbiddenError("Root admin only");
    }

    const started = Date.now();
    let connected = false;
    let latency_ms: number | null = null;
    let databases: string[] = [];
    let error: string | null = null;
    let databases_error: string | null = null;

    try {
      const conn = await getTenantClusterConnection();
      const client = conn.getClient();

      await client.db().admin().command({ ping: 1 });
      connected = true;
      latency_ms = Date.now() - started;

      try {
        const info = await client.db().admin().listDatabases();
        databases = info.databases.map((d) => d.name).sort();
      } catch (listErr: any) {
        databases_error = listErr.message;
      }
    } catch (err: any) {
      error = err.message;
    }

    SuccessResponse(res, {
      message: connected
        ? "Plesk MongoDB is reachable"
        : "Plesk MongoDB is not reachable",
      data: {
        plesk_mongo_uri: maskUri(env.PLESK_MONGO_URI || ""),
        connected,
        latency_ms,
        tenant_prefix: env.TENANT_DB_PREFIX,
        databases,
        databases_error,
        error,
      },
    });
  },
);
