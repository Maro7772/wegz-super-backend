import axios from "axios";
import https from "node:https";
import dns from "node:dns/promises";
import { env } from "../config/env";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============================================================================
// Helpers
// ============================================================================

function getXmlApiUrl(): string {
  return `https://${env.PLESK_HOST}:${env.PLESK_PORT}/enterprise/control/agent.php`;
}

function getRestApiUrl(utility: string): string {
  return `https://${env.PLESK_HOST}:${env.PLESK_PORT}/api/v2/cli/${utility}/call`;
}

async function sendPleskXml(xmlPacket: string): Promise<string> {
  if (!env.PLESK_API_KEY) {
    throw new Error("PLESK_API_KEY is not configured");
  }

  try {
    const response = await axios.post(getXmlApiUrl(), xmlPacket, {
      headers: {
        "Content-Type": "text/xml",
        KEY: env.PLESK_API_KEY,
      },
      httpsAgent,
      timeout: 30_000,
    });
    return response.data as string;
  } catch (err: any) {
    console.error("❌ Plesk XML API request failed:", err.message);
    throw new Error(`Plesk XML API request failed: ${err.message}`);
  }
}

function parsePleskXmlResponse(xml: string, operation: string): void {
  const statusMatch = xml.match(/<status>(.*?)<\/status>/);
  const errCodeMatch = xml.match(/<errcode>(.*?)<\/errcode>/);
  const errTextMatch = xml.match(/<errtext>(.*?)<\/errtext>/);

  if (statusMatch && statusMatch[1] === "error") {
    const code = errCodeMatch?.[1] ?? "unknown";
    const text = errTextMatch?.[1] ?? "Unknown Plesk error";
    throw new Error(`Plesk ${operation} failed [${code}]: ${text}`);
  }
}

// ============================================================================
// Subdomain name sanitize / validate
// ============================================================================

export function sanitizeSubdomainName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .substring(0, 63);
}

export function validateSubdomainName(name: string): string | null {
  if (!name || name.trim().length === 0) return "Subdomain name is required";

  const sanitized = sanitizeSubdomainName(name);
  if (sanitized.length < 3)
    return "Subdomain must be at least 3 characters long";
  if (sanitized.length > 63) return "Subdomain cannot exceed 63 characters";

  const reserved = [
    "www",
    "mail",
    "ftp",
    "admin",
    "api",
    "super",
    "superback",
    "back",
    "ns1",
    "ns2",
    "cpanel",
    "webmail",
    "updater",
  ];
  if (reserved.includes(sanitized)) {
    return `Subdomain "${sanitized}" is reserved`;
  }

  return null;
}

// ============================================================================
// Subdomain management (XML API)
// ============================================================================

export async function createSubdomain(name: string): Promise<string> {
  const sanitized = sanitizeSubdomainName(name);
  const full = `${sanitized}.${env.PLESK_PARENT_DOMAIN}`;

  console.log(`[Plesk] Creating subdomain: ${full}`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<packet>
  <subdomain>
    <add>
      <parent>${env.PLESK_PARENT_DOMAIN}</parent>
      <name>${sanitized}</name>
      <property>
        <name>www_root</name>
        <value>/${sanitized}</value>
      </property>
    </add>
  </subdomain>
</packet>`;

  try {
    const response = await sendPleskXml(xml);
    parsePleskXmlResponse(response, "subdomain creation");
  } catch (err: any) {
    // Retry-safe: لو الـ subdomain موجود بالفعل، نكمّل بدل ما نفشل
    if (/already\s+exists?/i.test(err.message)) {
      console.warn(`[Plesk] Subdomain ${full} already exists — reusing it`);
    } else {
      throw err;
    }
  }

  return full;
}

export async function deleteSubdomain(name: string): Promise<void> {
  const sanitized = sanitizeSubdomainName(name);
  const full = `${sanitized}.${env.PLESK_PARENT_DOMAIN}`;

  console.log(`[Plesk] Deleting subdomain: ${full}`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<packet>
  <subdomain>
    <del>
      <filter>
        <name>${full}</name>
      </filter>
    </del>
  </subdomain>
</packet>`;

  const response = await sendPleskXml(xml);
  parsePleskXmlResponse(response, "subdomain deletion");
}

// ============================================================================
// CLI Executor (REST API v2)
// ============================================================================

export async function executePleskCli(
  utility: string,
  args: string[],
): Promise<any> {
  if (!env.PLESK_API_KEY) throw new Error("PLESK_API_KEY is not configured");

  console.log(`[Plesk CLI] plesk bin ${utility} ${args.join(" ")}`);

  try {
    const response = await axios.post(
      getRestApiUrl(utility),
      { params: args },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": env.PLESK_API_KEY,
          Accept: "application/json",
        },
        httpsAgent,
        timeout: 120_000,
      },
    );

    const data = response.data as any;
    if (data && data.code !== 0) {
      console.warn(
        `[Plesk CLI Warning] Command returned code ${data.code}. stderr: ${data.stderr}`,
      );
      throw new Error(
        `Command failed [${data.code}]: ${data.stderr || data.stdout}`,
      );
    }
    return data;
  } catch (err: any) {
    const message = err.response?.data?.message || err.message;
    const stderr = err.response?.data?.stderr || "";
    console.error(`❌ Plesk CLI execution failed (${utility}): ${message}`);
    throw new Error(
      `Plesk CLI execution failed (${utility}): ${message} - ${stderr}`,
    );
  }
}

// ============================================================================
// Custom Domain & Site Alias Management (Plesk + DNS)
// ============================================================================

/**
 * تنظيف اسم الدومين المخصص وإزالة البروتوكول والمسارات
 * مثال: "https://www.sss.net/page" -> "sss.net"
 */
export function normalizeDomainName(domain: string): string {
  if (!domain) return "";
  let clean = domain.trim().toLowerCase();

  // إزالة البروتوكول إن وجد
  clean = clean.replace(/^https?:\/\//i, "");

  // إزالة أي مسار أو منفذ
  clean = clean.split("/")[0].split(":")[0];

  // إزالة أي فراغات أو شرطات متكررة
  clean = clean.replace(/^\.+|\.+$/g, "");

  return clean;
}

/**
 * التحقق من صحة صيغة الدومين المخصص
 */
export function validateCustomDomain(domain: string): string | null {
  const normalized = normalizeDomainName(domain);
  if (!normalized) return "Domain name is required";

  // فحص صيغة الـ FQDN (مثل example.com أو store.example.com)
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!domainRegex.test(normalized)) {
    return `Invalid domain format: "${domain}". Must be a valid domain like "example.com" or "sub.example.com"`;
  }

  // منع ربط النطاقات المحجوزة أو نطاق السيرفر نفسه
  const reserved = [
    "localhost",
    "wegz.org",
    "super.wegz.org",
    "superback.wegz.org",
    "api.wegz.org",
    "admin.wegz.org",
  ];
  if (reserved.includes(normalized)) {
    return `Domain "${normalized}" is reserved and cannot be assigned as a tenant custom domain`;
  }

  return null;
}

/**
 * جلب بيانات السيرفر وإعدادات الـ DNS المطلوبة لتوجيه أي Custom Domain إليه
 */
export async function getServerDnsInfo(): Promise<{
  serverIp: string;
  cnameTarget: string;
  dnsRecords: {
    type: string;
    host: string;
    value: string;
    description: string;
  }[];
  instructions: {
    ar: string;
    en: string;
  };
}> {
  let serverIp = "127.0.0.1";

  // 1. محاولة جلب الـ IP من إعدادات Plesk أو حل عنوان Plesk Host / Parent Domain عبر DNS
  try {
    const hostToResolve = env.PLESK_HOST && env.PLESK_HOST !== "localhost"
      ? env.PLESK_HOST
      : env.PLESK_PARENT_DOMAIN || "wegz.org";

    const resolved = await dns.lookup(hostToResolve);
    if (resolved?.address) {
      serverIp = resolved.address;
    }
  } catch (err: any) {
    console.warn("[Plesk] Could not resolve server IP via DNS:", err.message);
  }

  const cnameTarget = env.PLESK_PARENT_DOMAIN || "wegz.org";

  const dnsRecords = [
    {
      type: "A",
      host: "@",
      value: serverIp,
      description: "يوجه النطاق الأساسي (Root Domain مثل yourdomain.com) إلى عنوان السيرفر",
    },
    {
      type: "CNAME",
      host: "www",
      value: cnameTarget,
      description: `يوجه النطاق الفرعي www (مثل www.yourdomain.com) إلى سيرفر ${cnameTarget}`,
    },
  ];

  return {
    serverIp,
    cnameTarget,
    dnsRecords,
    instructions: {
      ar: `قم بالدخول إلى لوحة تحكم النطاق الخاص بك (مثل GoDaddy, Namecheap, Cloudflare) وأضف سجلات الـ DNS الموضحة أعلاه. يستغرق انتشار الـ DNS من بضع دقائق وحتى 24 ساعة.`,
      en: `Go to your domain registrar DNS settings (e.g. GoDaddy, Namecheap, Cloudflare) and add the A and CNAME records shown above. DNS propagation typically takes a few minutes up to 24 hours.`,
    },
  };
}

/**
 * إنشاء Domain Alias (Site Alias) في Plesk يوجه إلى الموقع الأساسي
 */
export async function createSiteAlias(
  aliasDomain: string,
  targetSite?: string,
): Promise<any> {
  const cleanAlias = normalizeDomainName(aliasDomain);
  const target = targetSite || env.PLESK_PARENT_DOMAIN || "wegz.org";

  const pleskReady = !!env.PLESK_API_KEY && env.PLESK_HOST !== "localhost";
  if (!pleskReady) {
    console.log(
      `🧪 [DEV] Simulated Plesk site-alias creation: ${cleanAlias} -> ${target}`,
    );
    return { success: true, simulated: true, alias: cleanAlias, target };
  }

  console.log(`[Plesk] Creating site alias: ${cleanAlias} for site: ${target}`);

  try {
    // استخدام plesk bin sitealias
    const result = await executePleskCli("sitealias", [
      "--create",
      cleanAlias,
      "-site",
      target,
      "-status",
      "true",
      "-web",
      "true",
      "-seo-redirect",
      "false", // لا نحول بريديركت لكي يظل الرابط كما هو في المتصفح
    ]);

    return result;
  } catch (err: any) {
    if (/already\s+exists?/i.test(err.message)) {
      console.warn(`[Plesk] Site alias ${cleanAlias} already exists — reusing`);
      return { success: true, reused: true, alias: cleanAlias };
    }
    throw err;
  }
}

/**
 * حذف Domain Alias من Plesk
 */
export async function deleteSiteAlias(aliasDomain: string): Promise<any> {
  const cleanAlias = normalizeDomainName(aliasDomain);

  const pleskReady = !!env.PLESK_API_KEY && env.PLESK_HOST !== "localhost";
  if (!pleskReady) {
    console.log(`🧪 [DEV] Simulated Plesk site-alias deletion: ${cleanAlias}`);
    return { success: true, simulated: true };
  }

  console.log(`[Plesk] Deleting site alias: ${cleanAlias}`);

  try {
    return await executePleskCli("sitealias", ["--delete", cleanAlias]);
  } catch (err: any) {
    console.warn(`[Plesk] Site alias deletion notice: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * فحص انتشار الـ DNS للنطاق والتأكد من أنه يشير إلى السيرفر
 */
export async function verifyDomainDns(
  domain: string,
  expectedIp?: string,
): Promise<{
  pointed: boolean;
  currentIps: string[];
  expectedIp: string;
}> {
  const cleanDomain = normalizeDomainName(domain);

  let targetIp = expectedIp;
  if (!targetIp) {
    const dnsInfo = await getServerDnsInfo();
    targetIp = dnsInfo.serverIp;
  }

  try {
    const resolvedIps = await dns.resolve4(cleanDomain);
    const pointed = resolvedIps.includes(targetIp);

    return {
      pointed,
      currentIps: resolvedIps,
      expectedIp: targetIp,
    };
  } catch (err: any) {
    return {
      pointed: false,
      currentIps: [],
      expectedIp: targetIp,
    };
  }
}

/**
 * إصدار وتثبيت شهادة SSL مجانية (Let's Encrypt / SSL It) لـ Custom Domain Alias
 */
export async function installAliasSsl(aliasDomain: string): Promise<any> {
  const cleanAlias = normalizeDomainName(aliasDomain);

  const pleskReady = !!env.PLESK_API_KEY && env.PLESK_HOST !== "localhost";
  if (!pleskReady) {
    console.log(`🧪 [DEV] Simulated SSL install for alias: ${cleanAlias}`);
    return { success: true, simulated: true };
  }

  console.log(`[Plesk] Issuing SSL for alias: ${cleanAlias}`);

  try {
    return await executePleskCli("extension", [
      "--call",
      "sslit",
      "--certificate",
      "-issue",
      "-domain",
      cleanAlias,
      "-secure-domain",
    ]);
  } catch (err: any) {
    console.warn(`[Plesk] SSL issue failed for alias ${cleanAlias}: ${err.message}`);
    throw err;
  }
}
