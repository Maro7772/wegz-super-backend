import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { env } from "../config/env";
import { rebuildFrontendForClient } from "../services/rebuild.service";
import type { Response } from "express";
import asyncHandler from "express-async-handler";
import crypto from "node:crypto";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { PackageModel } from "../models/Package";
import { SubscriptionModel } from "../models/Subscription";
import { TenantApiKeyModel } from "../models/TenantApiKey";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import {
  sanitizeSubdomainName,
  validateSubdomainName,
} from "../services/plesk.service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 🚀 Provisioning launcher (standalone background process)
// ============================================================================

function launchProvisioning(clientId: string) {
  const isDev = env.NODE_ENV === "development";

  // في production: dist/services/provisioner.runner.js
  // في development: src/services/provisioner.runner.ts (نستخدم tsx)
  const runnerPath = path.join(
    __dirname,
    "..",
    "services",
    isDev ? "provisioner.runner.ts" : "provisioner.runner.js",
  );

  let command: string;
  let args: string[];

  if (isDev) {
    // في التطوير، نستخدم tsx
    command = "npx";
    args = ["tsx", runnerPath, clientId];
  } else {
    // في production، نستخدم node مباشرة
    command = "node";
    args = [runnerPath, clientId];
  }

  console.log(`🚀 Launching provisioning in background`);
  console.log(`   Command: ${command} ${args.join(" ")}`);
  console.log(`   CWD: ${process.cwd()}`);

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
  });

  child.unref();

  console.log(`🚀 Provisioning started. PID: ${child.pid}`);
  return child.pid;
}

// ============================================================================
// Client CRUD
// ============================================================================

/**
 * POST /api/admin/clients
 * ينشئ Client record ويطلق provisioning في process منفصل.
 */
export const createClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { company_name, email, password, package_id, subdomain, logoBase64 } =
      req.body;

    if (!company_name || !email || !password || !package_id || !subdomain) {
      throw new BadRequest(
        "company_name, email, password, package_id, subdomain are required",
      );
    }

    const pkg = await PackageModel.findById(package_id);
    if (!pkg) throw new NotFound("Package not found");

    const validationError = validateSubdomainName(subdomain);
    if (validationError) throw new BadRequest(validationError);

    const sanitized = sanitizeSubdomainName(subdomain);

    const exists = await ClientModel.findOne({
      $or: [{ email: email.toLowerCase() }, { subdomain: sanitized }],
    });
    if (exists) throw new Conflict("Email or subdomain already exists");

    const client = await ClientModel.create({
      company_name,
      email,
      password,
      subdomain: sanitized,
      package_id,
      logoBase64,
      status: "pending",
      provisioning_status: "pending",
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "client.create",
      targetType: "Client",
      targetId: client._id,
      metadata: { email: client.email, subdomain: client.subdomain },
      ip: req.ip,
    });

    // 🚀 أطلق provisioning في process منفصل
    try {
      launchProvisioning(client._id.toString());
    } catch (err: any) {
      console.error(
        `Failed to launch provisioning for ${client._id}: ${err.message}`,
      );
      // مش fatal — نقدر نعيد من endpoint لاحقًا
    }

    SuccessResponse(
      res,
      {
        message: "Client created. Provisioning started in background.",
        data: {
          client: { id: client._id, status: client.provisioning_status },
          hint: "Use GET /api/admin/clients/:id/provisioning-logs to monitor progress",
        },
      },
      202,
    );
  },
);

/**
 * GET /api/admin/clients
 */
export const listClients = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const clients = await ClientModel.find()
      .sort({ createdAt: -1 })
      .populate("package_id", "name features");

    SuccessResponse(res, {
      message: "Clients retrieved",
      data: { clients },
    });
  },
);

/**
 * GET /api/admin/clients/:id
 */
export const getClientById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id).populate(
      "package_id",
    );

    if (!client) throw new NotFound("Client not found");

    const sub = await SubscriptionModel.findOne({
      client_id: client._id,
      status: "active",
    }).sort({ end_date: -1 });

    SuccessResponse(res, {
      message: "Client retrieved",
      data: { client, subscription: sub },
    });
  },
);

/**
 * GET /api/admin/clients/:id/provisioning-status
 */
export const getProvisioningStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id).select(
      "provisioning_status provisioning_error subdomain_url backend_url db_name",
    );
    if (!client) throw new NotFound("Client not found");
    SuccessResponse(res, {
      message: "Provisioning status",
      data: client,
    });
  },
);

/**
 * GET /api/admin/clients/:id/provisioning-logs
 * ✅ جديد — يعرض تفاصيل كل خطوة + الوقت
 */
export const getProvisioningLogs = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id).select(
      "provisioning_status provisioning_error provisioning_started_at provisioning_updated_at provisioning_step_details company_name subdomain",
    );
    if (!client) throw new NotFound("Client not found");

    const startedAt = (client as any).provisioning_started_at;
    const updatedAt = (client as any).provisioning_updated_at;

    const elapsedSeconds =
      startedAt && updatedAt
        ? Math.round(
            (new Date(updatedAt).getTime() - new Date(startedAt).getTime()) /
              1000,
          )
        : null;

    // Convert Map to plain object
    let steps: Record<string, string[]> = {};
    const stepMap = (client as any).provisioning_step_details;
    if (stepMap && typeof stepMap.forEach === "function") {
      stepMap.forEach((value: string[], key: string) => {
        steps[key] = value;
      });
    } else if (stepMap && typeof stepMap === "object") {
      steps = stepMap;
    }

    SuccessResponse(res, {
      message: "Provisioning logs",
      data: {
        client: {
          id: client._id,
          company_name: client.company_name,
          subdomain: client.subdomain,
        },
        status: client.provisioning_status,
        error: client.provisioning_error,
        started_at: startedAt,
        updated_at: updatedAt,
        elapsed_seconds: elapsedSeconds,
        steps,
      },
    });
  },
);

/**
 * PATCH /api/admin/clients/:id
 * يعدّل بيانات أساسية (اسم/إيميل/باكدج/حالة).
 * Subdomain لا يتغير بعد الإنشاء.
 */
export const updateClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { subdomain, ...rest } = req.body;

    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    if (rest.email && rest.email.toLowerCase() !== client.email) {
      const exists = await ClientModel.findOne({
        email: rest.email.toLowerCase(),
      });
      if (exists) throw new Conflict("Email already in use");
    }

    Object.assign(client, rest);
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.update",
      targetType: "Client",
      targetId: client._id,
      metadata: { changed: Object.keys(req.body) },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Client updated",
      data: { client },
    });
  },
);

/**
 * DELETE /api/admin/clients/:id
 * يحذف الـ Client record بس. حذف Plesk/DB يتم في Provisioner لاحقًا.
 */
export const deleteClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    await ClientModel.findByIdAndDelete(client._id);
    await SubscriptionModel.deleteMany({ client_id: client._id });
    await TenantApiKeyModel.updateMany(
      { client_id: client._id },
      { active: false },
    );

    await logAudit({
      adminId: req.admin!.id,
      action: "client.delete",
      targetType: "Client",
      targetId: client._id,
      metadata: { email: client.email, subdomain: client.subdomain },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Client deleted" });
  },
);

/**
 * POST /api/admin/clients/:id/regenerate-api-key
 */
export const regenerateApiKey = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    // Revoke all previous keys
    await TenantApiKeyModel.updateMany(
      { client_id: client._id, active: true },
      { $set: { active: false } },
    );

    const rawKey = `sk_${crypto.randomUUID()}_${crypto.randomBytes(16).toString("hex")}`;
    const hashed = crypto.createHash("sha256").update(rawKey).digest("hex");

    await TenantApiKeyModel.create({
      client_id: client._id,
      hashedKey: hashed,
      label: "regenerated",
      active: true,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "client.apikey.regenerate",
      targetType: "Client",
      targetId: client._id,
      ip: req.ip,
    });

    SuccessResponse(res, {
      message:
        "API key regenerated. Store it securely — it will not be shown again.",
      data: { apiKey: rawKey },
    });
  },
);

/**
 * POST /api/admin/clients/:id/suspend
 */
export const suspendClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    client.status = "suspended";
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.suspend",
      targetType: "Client",
      targetId: client._id,
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Client suspended",
      data: { client },
    });
  },
);

/**
 * POST /api/admin/clients/:id/activate
 */
export const activateClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    client.status = "active";
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.activate",
      targetType: "Client",
      targetId: client._id,
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Client activated",
      data: { client },
    });
  },
);

/**
 * POST /api/admin/clients/:id/rebuild-frontend
 * (يعمل inject للـ API URL في bundles الـ frontend)
 */
export const rebuildFrontend = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");
    if (!client.subdomain) throw new BadRequest("Client has no subdomain");

    await rebuildFrontendForClient(client.subdomain, client.backend_url!);

    await logAudit({
      adminId: req.admin!.id,
      action: "client.rebuild_frontend",
      targetType: "Client",
      targetId: client._id,
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Frontend rebuild initiated" });
  },
);

/**
 * GET /api/admin/clients/:id/logs
 * يقرأ startup-error.log من الـ backend directory.
 */
export const getClientLogs = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.subdomain)
      throw new NotFound("Client or subdomain not found");

    const logPath = path.join(
      env.PLESK_VHOSTS_DIR,
      `api-${client.subdomain}`,
      "startup-error.log",
    );

    let content = "";
    try {
      content = await fs.readFile(logPath, "utf-8");
    } catch {
      content = "(no log file found)";
    }

    SuccessResponse(res, {
      message: "Client logs retrieved",
      data: {
        path: logPath,
        content,
        size: content.length,
      },
    });
  },
);

/**
 * POST /api/admin/clients/:id/reset-admin-password
 * body: { new_password: string }
 * يعيد تعيين باسورد الـ admin user داخل Tenant DB.
 */
export const resetTenantAdminPassword = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { new_password } = req.body as { new_password?: string };
    if (!new_password || new_password.length < 6) {
      throw new BadRequest("new_password must be at least 6 characters");
    }

    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.db_name) {
      throw new NotFound("Client or DB not found");
    }

    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash(new_password, 10);

    const conn = (await import("mongoose")).default.connection.useDb(
      client.db_name,
      { useCache: true },
    );

    await conn
      .collection("users")
      .updateOne(
        { username: "admin" },
        { $set: { password_hash: hash, updatedAt: new Date() } },
      );

    await logAudit({
      adminId: req.admin!.id,
      action: "client.reset_admin_password",
      targetType: "Client",
      targetId: client._id,
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Tenant admin password reset" });
  },
);

/**
 * POST /api/admin/clients/:id/ssl/install
 */
export const installClientSsl = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.subdomain) {
      throw new NotFound("Client or subdomain not found");
    }

    const frontendSub = `${client.subdomain}.${env.PLESK_PARENT_DOMAIN}`;
    const backendSub = `api-${client.subdomain}.${env.PLESK_PARENT_DOMAIN}`;
    const email = env.SSL_ADMIN_EMAIL;

    if (!email) throw new BadRequest("SSL_ADMIN_EMAIL not configured");

    const { executePleskCli } = await import("../services/plesk.service");

    const results: any[] = [];
    for (const sub of [frontendSub, backendSub]) {
      try {
        await executePleskCli("extension", [
          "--exec",
          "letsencrypt",
          "cli.php",
          "-d",
          sub,
          "-m",
          email,
        ]);
        results.push({ subdomain: sub, success: true });
      } catch (err: any) {
        results.push({ subdomain: sub, success: false, error: err.message });
      }
    }

    await logAudit({
      adminId: req.admin!.id,
      action: "client.ssl_install",
      targetType: "Client",
      targetId: client._id,
      metadata: { results },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "SSL install attempted",
      data: { results },
    });
  },
);

/**
 * DELETE /api/admin/clients/:id/full
 * حذف كامل: DB + subdomains + files + subscription + api keys + client record.
 * ⚠️ خطير — مفيش rollback.
 */
export const deleteClientFull = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    const { deleteSubdomain } = await import("../services/plesk.service");
    const mongoose = (await import("mongoose")).default;

    // 1. Delete subdomains
    if (client.subdomain) {
      await deleteSubdomain(client.subdomain).catch((err) =>
        console.warn(`Delete frontend subdomain failed: ${err.message}`),
      );
      await deleteSubdomain(`api-${client.subdomain}`).catch((err) =>
        console.warn(`Delete backend subdomain failed: ${err.message}`),
      );
    }

    // 2. Drop DB
    if (client.db_name) {
      await mongoose.connection
        .useDb(client.db_name, { useCache: false })
        .dropDatabase()
        .catch((err) => console.warn(`Drop DB failed: ${err.message}`));
    }

    // 3. Delete subscriptions + api keys
    await SubscriptionModel.deleteMany({ client_id: client._id });
    await TenantApiKeyModel.deleteMany({ client_id: client._id });

    // 4. Delete client record
    await ClientModel.findByIdAndDelete(client._id);

    await logAudit({
      adminId: req.admin!.id,
      action: "client.delete_full",
      targetType: "Client",
      targetId: client._id,
      metadata: { subdomain: client.subdomain, db_name: client.db_name },
      ip: req.ip,
    });

    SuccessResponse(res, { message: "Client fully deleted" });
  },
);
