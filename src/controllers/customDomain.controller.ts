import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound, Conflict } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { logAudit } from "../utils/audit.util";
import {
  getServerDnsInfo,
  normalizeDomainName,
  validateCustomDomain,
  deleteCustomDomainWebsite,
  verifyDomainDns,
} from "../services/plesk.service";
import { startDomainBackgroundSetup } from "../services/customDomainBackground.service";
import { env } from "../config/env";

/**
 * GET /api/admin/custom-domains/server-info
 * يعرض بيانات السيرفر وإعدادات الـ DNS المطلوبة ليتمكن العميل من توجيه نطاقه إليه
 */
export const getServerDnsInfoHandler = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const dnsInfo = await getServerDnsInfo();

    SuccessResponse(res, {
      message: "Server DNS instructions retrieved",
      data: dnsInfo,
    });
  },
);

/**
 * GET /api/admin/custom-domains
 * يعرض قائمة جميع العملاء الذين لديهم Custom Domains وحالة كل دومين
 */
export const listCustomDomainsHandler = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const clients = await ClientModel.find({
      custom_domain: { $exists: true, $ne: "" },
    })
      .select(
        "_id company_name subdomain subdomain_url custom_domain custom_domain_status custom_domain_ssl custom_domain_created_at custom_domain_verified_at status",
      )
      .sort({ custom_domain_created_at: -1 })
      .lean();

    SuccessResponse(res, {
      message: "Custom domains retrieved",
      data: {
        total: clients.length,
        domains: clients,
      },
    });
  },
);

/**
 * POST /api/admin/custom-domains
 * يربط دومين مخصص بعميل محدد — الـ subdomain يُستخرج تلقائياً من سجل العميل
 * body: { client_id: string, custom_domain: string }
 *
 * كل العمليات الثقيلة (إنشاء website في Plesk → DNS → SSL) تتم في الخلفية
 */
export const assignCustomDomainHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { client_id, custom_domain } = req.body || {};

    if (!custom_domain) {
      throw new BadRequest("custom_domain is required");
    }

    if (!client_id) {
      throw new BadRequest("client_id is required");
    }

    const cleanDomain = normalizeDomainName(custom_domain);
    const validationError = validateCustomDomain(cleanDomain);
    if (validationError) {
      throw new BadRequest(validationError);
    }

    // البحث عن العميل بالـ ID
    const client = await ClientModel.findById(client_id);
    if (!client) {
      throw new NotFound("Client not found");
    }

    if (!client.subdomain) {
      throw new BadRequest("Client does not have a subdomain configured");
    }

    // التأكد من أن هذا الدومين غير مخصص لعميل آخر
    const existingOther = await ClientModel.findOne({
      _id: { $ne: client._id },
      custom_domain: cleanDomain,
    });
    if (existingOther) {
      throw new Conflict(
        `Custom domain "${cleanDomain}" is already assigned to another client (${existingOther.subdomain})`,
      );
    }

    // حذف الـ Website القديم من Plesk إذا تم تغيير الدومين
    const previousDomain = client.custom_domain;
    if (previousDomain && previousDomain !== cleanDomain) {
      deleteCustomDomainWebsite(previousDomain).catch((err) =>
        console.warn(`[CustomDomain] Delete previous website notice: ${err.message}`),
      );
    }

    // تحديث بيانات العميل فوراً
    client.custom_domain = cleanDomain;
    client.custom_domain_status = "pending_setup";
    client.custom_domain_ssl = false;
    client.custom_domain_created_at = new Date();
    client.custom_domain_verified_at = undefined;
    await client.save();

    // تشغيل كل العمليات في الخلفية: إنشاء Website → فحص DNS → إصدار SSL
    startDomainBackgroundSetup(
      client._id.toString(),
      cleanDomain,
      client.subdomain,
    );

    await logAudit({
      adminId: req.admin!.id,
      action: "client.custom_domain.assign",
      targetType: "Client",
      targetId: client._id,
      metadata: {
        custom_domain: cleanDomain,
        subdomain: client.subdomain,
        status: "pending_setup",
      },
      ip: req.ip,
    });

    const dnsInfo = await getServerDnsInfo();

    SuccessResponse(
      res,
      {
        message:
          "Custom domain setup started! Website creation, DNS verification, and SSL will be configured automatically in the background.",
        data: {
          client_id: client._id,
          subdomain: client.subdomain,
          target_url:
            client.subdomain_url ||
            `https://${client.subdomain}.${env.PLESK_PARENT_DOMAIN}`,
          custom_domain: cleanDomain,
          status: "pending_setup",
          dns_instructions: dnsInfo.dnsRecords,
        },
      },
      201,
    );
  },
);

/**
 * DELETE /api/admin/custom-domains/:id
 * يحذف النطاق المخصص من العميل ويحذف الـ Website من Plesk
 */
export const removeCustomDomainHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const clientId = req.params.id;
    const client = await ClientModel.findById(clientId);
    if (!client) throw new NotFound("Client not found");

    const previousDomain = client.custom_domain;
    if (!previousDomain) {
      throw new BadRequest("Client does not have a custom domain assigned");
    }

    // حذف الـ Website من Plesk في الخلفية
    deleteCustomDomainWebsite(previousDomain).catch((err) =>
      console.warn(`[CustomDomain] Delete website notice: ${err.message}`),
    );

    client.custom_domain = undefined;
    client.custom_domain_status = "disabled";
    client.custom_domain_ssl = false;
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.custom_domain.remove",
      targetType: "Client",
      targetId: client._id,
      metadata: { removed_domain: previousDomain },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: `Custom domain "${previousDomain}" removed successfully`,
    });
  },
);

/**
 * POST /api/admin/custom-domains/:id/verify-dns
 * فحص انتشار الـ DNS للنطاق — إذا لم يكتمل بعد يبدأ فاحص المراقبة في الخلفية
 */
export const verifyCustomDomainDnsHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.custom_domain) {
      throw new NotFound("Client or custom domain not found");
    }

    const dnsCheck = await verifyDomainDns(client.custom_domain);

    if (dnsCheck.pointed && client.custom_domain_status !== "active") {
      client.custom_domain_status = "active";
      client.custom_domain_verified_at = new Date();
      await client.save();
    }

    // إذا لم يكتمل الـ DNS بعد، نعيد تشغيل المراقبة في الخلفية
    if (!dnsCheck.pointed && client.subdomain) {
      startDomainBackgroundSetup(
        client._id.toString(),
        client.custom_domain,
        client.subdomain,
      );
    }

    SuccessResponse(res, {
      message: dnsCheck.pointed
        ? "DNS verified successfully! Domain is active."
        : "DNS is not pointing to this server yet. Background watcher is active.",
      data: {
        domain: client.custom_domain,
        pointed: dnsCheck.pointed,
        current_ips: dnsCheck.currentIps,
        expected_ip: dnsCheck.expectedIp,
        status: client.custom_domain_status,
      },
    });
  },
);

/**
 * POST /api/admin/custom-domains/:id/ssl
 * إصدار شهادة SSL — إذا الـ DNS لم يكتمل بعد، تشتغل في الخلفية تلقائياً
 */
export const installCustomDomainSslHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.custom_domain) {
      throw new NotFound("Client or custom domain not found");
    }

    if (!client.subdomain) {
      throw new BadRequest("Client does not have a subdomain configured");
    }

    // نعيد تشغيل الفاحص الكامل (website + DNS + SSL) في الخلفية
    startDomainBackgroundSetup(
      client._id.toString(),
      client.custom_domain,
      client.subdomain,
    );

    await logAudit({
      adminId: req.admin!.id,
      action: "client.custom_domain.ssl",
      targetType: "Client",
      targetId: client._id,
      metadata: { domain: client.custom_domain },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message:
        "SSL setup started in the background. The certificate will be issued automatically once DNS is verified.",
      data: {
        domain: client.custom_domain,
        status: client.custom_domain_status,
        ssl_status: "pending_background",
      },
    });
  },
);
