import axios from "axios";
import https from "node:https";
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
        <value>/subdomains/${sanitized}</value>
      </property>
    </add>
  </subdomain>
</packet>`;

  const response = await sendPleskXml(xml);
  parsePleskXmlResponse(response, "subdomain creation");

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
