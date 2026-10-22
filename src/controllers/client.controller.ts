import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { rebuildFrontendForClient } from "../services/rebuild.service";
import type { Response } from "express";
import asyncHandler from "express-async-handler";
import crypto from "node:crypto";
import mongoose from "mongoose";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { SectionModel } from "../models/Section";
import { TenantApiKeyModel } from "../models/TenantApiKey";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import {
  sanitizeSubdomainName,
  validateSubdomainName,
} from "../services/plesk.service";
import { spawnProvisioningTask } from "../services/provisioner.service"; // ← المرحلة الجاية

/**
 * يتحقق من مصفوفة الـ sections ويرجّع IDs صالحة بدون تكرار.
 * - undefined  → مفيش تغيير
 * - []         → مسح كل السكاشن
 */
async function resolveSections(
  input: unknown,
): Promise<mongoose.Types.ObjectId[] | undefined> {
  if (input === undefined) return undefined;

  if (!Array.isArray(input)) {
    throw new BadRequest("sections must be an array of section ids");
  }

  const unique = [...new Set(input.map((value) => String(value)).filter(Boolean))];

  for (const id of unique) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequest(`Invalid section id: ${id}`);
    }
  }

  if (!unique.length) return [];

  const found = await SectionModel.find({ _id: { $in: unique } })
    .select("_id")
    .lean();

  if (found.length !== unique.length) {
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    const missing = unique.filter((id) => !foundIds.has(id));
    throw new NotFound(`Section(s) not found: ${missing.join(", ")}`);
  }

  return unique.map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * POST /api/admin/clients
 * ينشئ Client record ويطلق provisioning في الخلفية.
 */
export const createClient = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      company_name,
      email,
      password,
      subdomain,
      logoBase64,
      sections,
      sales_agent_id,
      sales_man_name,
      sales_man_phone,
      operation_status,
      payment_cycle,
      payment_amount,
    } = req.body;

    if (!company_name || !email || !password || !subdomain) {
      throw new BadRequest(
        "company_name, email, password, subdomain are required",
      );
    }

    const validationError = validateSubdomainName(subdomain);
    if (validationError) throw new BadRequest(validationError);

    const sanitized = sanitizeSubdomainName(subdomain);

    const exists = await ClientModel.findOne({
      $or: [{ email: email.toLowerCase() }, { subdomain: sanitized }],
    });
    if (exists) throw new Conflict("Email or subdomain already exists");

    const sectionIds = await resolveSections(sections);

    const client = await ClientModel.create({
      company_name,
      email,
      password,
      subdomain: sanitized,
      logoBase64,
      status: "pending",
      provisioning_status: "pending",
      sections: sectionIds ?? [],
      sales_agent_id,
      sales_man_name,
      sales_man_phone,
      operation_status,
      payment_cycle,
      payment_amount: payment_amount ?? 0,
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "client.create",
      targetType: "Client",
      targetId: client._id,
      metadata: { email: client.email, subdomain: client.subdomain },
      ip: req.ip,
    });

    // Provision in a detached scheduled task. Plesk restarts the web server while
    // creating subdomains / enabling Node.js / issuing SSL, which would kill an
    // in-process provisioning job (that is why it used to get stuck).
    await spawnProvisioningTask(client._id.toString()).catch((err) => {
      console.error(`❌ Could not start provisioning for ${client._id}:`, err);
    });

    SuccessResponse(
      res,
      {
        message: "Client created. Provisioning will start shortly.",
        data: {
          client: { id: client._id, status: client.provisioning_status },
          // 🔑 في dev mode نرجّع الـ API key مباشرة (فقط للاختبار)
          ...(env.NODE_ENV === "development" && {
            devHint: "API key سيظهر في terminal بعد ثانية",
          }),
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
  async (req: AuthRequest, res: Response) => {
    const { status, section_id, category_id, subcategory_id, search } =
      req.query as any;

    if (category_id !== undefined || subcategory_id !== undefined) {
      throw new BadRequest(
        "category_id/subcategory_id are no longer supported; use sections",
      );
    }

    const filter: any = {};
    if (status) filter.status = status;
    if (section_id) filter.sections = section_id;
    if (search) {
      filter.$or = [
        { company_name: new RegExp(String(search), "i") },
        { email: new RegExp(String(search), "i") },
        { subdomain: new RegExp(String(search), "i") },
      ];
    }

    const [clients, totalSections] = await Promise.all([
      ClientModel.find(filter)
        .sort({ createdAt: -1 })
        .populate("sections", "key name ar_name status order")
        .populate("sales_agent_id", "name email")
        .lean(),
      SectionModel.countDocuments({ status: "active" }),
    ]);

    const data = clients.map((client: any) => {
      const assigned = (client.sections ?? []).filter(Boolean);
      return {
        ...client,
        sections: assigned,
        sections_count: assigned.length,
        total_sections: totalSections,
      };
    });

    SuccessResponse(res, {
      message: "Clients retrieved",
      data: { clients: data, total_sections: totalSections },
    });
  },
);

/**
 * GET /api/admin/clients/:id
 */
export const getClientById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id)
      .populate("sections", "key name ar_name status order")
      .populate("sales_agent_id", "name email");

    if (!client) throw new NotFound("Client not found");

    const totalSections = await SectionModel.countDocuments({ status: "active" });
    const assigned = (client.sections ?? []).filter(Boolean);

    SuccessResponse(res, {
      message: "Client retrieved",
      data: {
        client: {
          ...client.toObject(),
          sections: assigned,
          sections_count: assigned.length,
          total_sections: totalSections,
        },
      },
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
 * PATCH /api/admin/clients/:id
 * يعدّل بيانات أساسية (اسم/إيميل/سكاشن/حالة).
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

    if (rest.category_id !== undefined || rest.subcategory_id !== undefined) {
      throw new BadRequest(
        "category_id/subcategory_id are no longer supported; use sections",
      );
    }

    if (rest.sections !== undefined) {
      rest.sections = await resolveSections(rest.sections);
    }

    Object.assign(client, rest);
    await client.save();

    const populated = await ClientModel.findById(client._id)
      .populate("sections", "key name ar_name status order")
      .populate("sales_agent_id", "name email");
    const totalSections = await SectionModel.countDocuments({ status: "active" });
    const assigned = (populated?.sections ?? []).filter(Boolean);

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
      data: {
        client: {
          ...populated!.toObject(),
          sections: assigned,
          sections_count: assigned.length,
          total_sections: totalSections,
        },
      },
    });
  },
);

/**
 * GET /api/admin/clients/:id/sections
 * يرجع سكاشن العميل + العدد من إجمالي السكاشن.
 */
export const getClientSections = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id)
      .select("company_name sections")
      .populate("sections", "key name ar_name status order")
      .lean();

    if (!client) throw new NotFound("Client not found");

    const totalSections = await SectionModel.countDocuments({ status: "active" });
    const assigned = ((client as any).sections ?? []).filter(Boolean);

    SuccessResponse(res, {
      message: "Client sections retrieved",
      data: {
        client_id: (client as any)._id,
        company_name: (client as any).company_name,
        sections: assigned,
        sections_count: assigned.length,
        total_sections: totalSections,
      },
    });
  },
);

/**
 * PUT /api/admin/clients/:id/sections
 * body: { sections: string[] }  ← بيستبدل كل السكاشن
 */
export const setClientSections = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    const ids = await resolveSections(req.body?.sections);
    if (ids === undefined) {
      throw new BadRequest(
        "sections is required and must be an array (use [] to clear)",
      );
    }

    client.sections = ids as any;
    await client.save();

    const populated = await ClientModel.findById(client._id).populate(
      "sections",
      "key name ar_name status order",
    );
    const totalSections = await SectionModel.countDocuments({ status: "active" });
    const assigned = ((populated as any)?.sections ?? []).filter(Boolean);

    await logAudit({
      adminId: req.admin!.id,
      action: "client.sections.update",
      targetType: "Client",
      targetId: client._id,
      metadata: { sections: ids.map(String) },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: "Client sections updated",
      data: {
        sections: assigned,
        sections_count: assigned.length,
        total_sections: totalSections,
      },
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

    SuccessResponse(res, { message: "Client suspended", data: { client } });
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

    SuccessResponse(res, { message: "Client activated", data: { client } });
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

    const { getTenantDatabase } = await import("../config/tenantDb");
    const conn = await getTenantDatabase(client.db_name);

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
 * حذف كامل: DB + subdomains + files + api keys + client record.
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
      const { getTenantDatabase } = await import("../config/tenantDb");
      const conn = await getTenantDatabase(client.db_name);
      await conn
        .dropDatabase()
        .catch((err) => console.warn(`Drop DB failed: ${err.message}`));
    }

    // 3. Delete api keys
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

/**
 * POST /api/admin/clients/:id/retry-provisioning
 * إعادة تشغيل الـ provisioning لعميل معلق أو فاشل.
 */
export const retryProvisioning = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    if (client.provisioning_status === "completed") {
      throw new BadRequest("Client provisioning is already completed");
    }

    // إعادة تعيين الحالة إلى pending ومسح رسالة الخطأ
    await ClientModel.findByIdAndUpdate(client._id, {
      provisioning_status: "pending",
      provisioning_error: null,
    });

    // تشغيل الـ provisioning في الخلفية (خارج Passenger)
    await spawnProvisioningTask(client._id.toString()).catch((err) => {
      console.error(
        `❌ Could not start retry provisioning for ${client._id}:`,
        err,
      );
    });

    await logAudit({
      adminId: req.admin!.id,
      action: "client.retry_provisioning",
      targetType: "Client",
      targetId: client._id,
      metadata: { email: client.email, subdomain: client.subdomain },
      ip: req.ip,
    });

    SuccessResponse(
      res,
      {
        message: "Provisioning retry started",
        data: { id: client._id, provisioning_status: "pending" },
      },
      202,
    );
  },
);
