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
  createSiteAlias,
  deleteSiteAlias,
  verifyDomainDns,
  installAliasSsl,
} from "../services/plesk.service";
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
 * يربط دومين مخصص (مثل sss.net) بعميل/subdomain محدد
 * body: { client_id?, subdomain?, custom_domain: string }
 */
export const assignCustomDomainHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { client_id, subdomain, custom_domain } = req.body || {};

    if (!custom_domain) {
      throw new BadRequest("custom_domain is required");
    }

    const cleanDomain = normalizeDomainName(custom_domain);
    const validationError = validateCustomDomain(cleanDomain);
    if (validationError) {
      throw new BadRequest(validationError);
    }

    // البحث عن العميل إما بالـ client_id أو بالـ subdomain
    let client: any = null;
    if (client_id) {
      client = await ClientModel.findById(client_id);
    } else if (subdomain) {
      client = await ClientModel.findOne({
        subdomain: String(subdomain).toLowerCase().trim(),
      });
    }

    if (!client) {
      throw new NotFound("Client not found (specify valid client_id or subdomain)");
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

    // 1. إنشاء الـ Site Alias في Plesk
    let pleskAliasResult: any = null;
    try {
      pleskAliasResult = await createSiteAlias(
        cleanDomain,
        env.PLESK_PARENT_DOMAIN,
      );
    } catch (err: any) {
      console.warn(`[CustomDomain] Plesk alias warning: ${err.message}`);
    }

    // 2. فحص انتشار الـ DNS مباشرة لمعرفة هل العميل قام بالتوجيه أم لا
    const dnsStatus = await verifyDomainDns(cleanDomain);
    const domainStatus = dnsStatus.pointed ? "active" : "pending_dns";

    // 3. تحديث بيانات العميل
    client.custom_domain = cleanDomain;
    client.custom_domain_status = domainStatus;
    client.custom_domain_created_at = new Date();
    if (dnsStatus.pointed) {
      client.custom_domain_verified_at = new Date();
    }
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.custom_domain.assign",
      targetType: "Client",
      targetId: client._id,
      metadata: {
        custom_domain: cleanDomain,
        subdomain: client.subdomain,
        status: domainStatus,
        dns_pointed: dnsStatus.pointed,
      },
      ip: req.ip,
    });

    const dnsInfo = await getServerDnsInfo();

    SuccessResponse(
      res,
      {
        message: dnsStatus.pointed
          ? "Custom domain assigned and DNS is pointing successfully!"
          : "Custom domain assigned. Please update your domain DNS records as indicated.",
        data: {
          client_id: client._id,
          subdomain: client.subdomain,
          target_url: client.subdomain_url || `https://${client.subdomain}.${env.PLESK_PARENT_DOMAIN}`,
          custom_domain: cleanDomain,
          status: domainStatus,
          dns_status: dnsStatus,
          dns_instructions: dnsInfo.dnsRecords,
          plesk_result: pleskAliasResult,
        },
      },
      201,
    );
  },
);

/**
 * DELETE /api/admin/custom-domains/:id
 * يحذف النطاق المخصص من العميل ويلغي الـ Alias من Plesk
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

    // حذف الـ Alias من Plesk
    await deleteSiteAlias(previousDomain).catch((err) =>
      console.warn(`[CustomDomain] Delete alias notice: ${err.message}`),
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
 * فحص انتشار الـ DNS للنطاق وتحديث حالته لـ active إذا كان يشير للسيرفر
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

      // محاولة إصدار شهادة SSL تلقائياً بمجرد تأكيد الـ DNS
      installAliasSsl(client.custom_domain)
        .then(async () => {
          client.custom_domain_ssl = true;
          await client.save();
        })
        .catch((sslErr) => {
          console.warn(`[SSL Auto-Issue notice]: ${sslErr.message}`);
        });
    }

    SuccessResponse(res, {
      message: dnsCheck.pointed
        ? "DNS verified successfully! Domain is active."
        : "DNS is not pointing to this server yet. Please verify your A and CNAME records.",
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
 * إصدار شهادة SSL للنطاق المخصص عبر Plesk
 */
export const installCustomDomainSslHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client || !client.custom_domain) {
      throw new NotFound("Client or custom domain not found");
    }

    const dnsCheck = await verifyDomainDns(client.custom_domain);
    if (!dnsCheck.pointed) {
      throw new BadRequest(
        `Cannot issue SSL for "${client.custom_domain}". The domain does not point to this server (${dnsCheck.expectedIp}) yet.`,
      );
    }

    const sslResult = await installAliasSsl(client.custom_domain);
    client.custom_domain_ssl = true;
    await client.save();

    await logAudit({
      adminId: req.admin!.id,
      action: "client.custom_domain.ssl",
      targetType: "Client",
      targetId: client._id,
      metadata: { domain: client.custom_domain },
      ip: req.ip,
    });

    SuccessResponse(res, {
      message: `SSL certificate installed successfully for ${client.custom_domain}`,
      data: sslResult,
    });
  },
);
