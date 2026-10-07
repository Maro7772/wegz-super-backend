import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { env } from "../config/env";
import { ClientModel } from "../models/Client";
import { SubscriptionModel } from "../models/Subscription";
import { TenantApiKeyModel } from "../models/TenantApiKey";
import {
  createSubdomain,
  deleteSubdomain,
  executePleskCli,
} from "./plesk.service";

const execAsync = promisify(exec);

interface ProvisionContext {
  clientId: string;
  subdomain: string;
  dbName: string;
  frontendSubdomain?: string;
  backendSubdomain?: string;
  rawApiKey?: string;
  completed: string[];
}

// ============================================================================
// Main entry
// ============================================================================

export async function provisionClient(clientId: string) {
  const client = await ClientModel.findById(clientId).populate("package_id");
  if (!client) throw new Error(`Client ${clientId} not found`);

  // ==========================================================================
  // 🧪 DEV MODE: simulate provisioning when Plesk is not configured
  // ==========================================================================
  const isDev = env.NODE_ENV === "development";
  const pleskReady = !!env.PLESK_API_KEY && env.PLESK_HOST !== "localhost";

  if (isDev && !pleskReady) {
    console.log(
      `🧪 DEV MODE: Simulating provisioning for ${client.subdomain} (Plesk not configured)`,
    );
    return simulateProvisioning(client);
  }

  // ==========================================================================
  // 🚀 REAL provisioning (Plesk)
  // ==========================================================================
  const ctx: ProvisionContext = {
    clientId: client._id.toString(),
    subdomain: client.subdomain,
    dbName: `sc_${client._id}`,
    completed: [],
  };

  try {
    // 1. Tenant DB
    await setProvisioningStatus(clientId, "creating_db");
    await createTenantDatabase(ctx.dbName, client);
    ctx.completed.push("db");

    // 2. Subdomains (frontend + backend)
    await setProvisioningStatus(clientId, "creating_subdomain");
    ctx.frontendSubdomain = await createSubdomain(ctx.subdomain);
    ctx.backendSubdomain = await createSubdomain(`api-${ctx.subdomain}`);
    ctx.completed.push("subdomains");

    // 3. Copy files (frontend + backend) + generate env + htaccess
    await setProvisioningStatus(clientId, "deploying");
    await deployFiles(ctx);
    ctx.completed.push("files");

    // 4. API Key (generate + store hash)
    await setProvisioningStatus(clientId, "generating_key");
    ctx.rawApiKey = await generateTenantApiKey(ctx.clientId);
    ctx.completed.push("apiKey");

    // 5. Write final backend .env (with API key injected)
    await writeBackendEnv(ctx);
    ctx.completed.push("backendEnv");

    // 6. Subscription (سنة من الآن — عدّلها حسب حاجتك)
    await setProvisioningStatus(clientId, "creating_subscription");
    await createInitialSubscription(
      ctx.clientId,
      (client.package_id as any)._id,
    );
    ctx.completed.push("subscription");

    // 7. SSL (best-effort)
    await setProvisioningStatus(clientId, "installing_ssl");
    await installSslSafe(ctx.frontendSubdomain, ctx.backendSubdomain);
    ctx.completed.push("ssl");

    // 8. Finalize
    client.subdomain_url = `https://${ctx.frontendSubdomain}`;
    client.backend_url = `https://${ctx.backendSubdomain}`;
    client.db_name = ctx.dbName;
    client.status = "active";
    client.provisioning_status = "completed";
    client.provisioning_error = undefined;
    await client.save();

    console.log(`✅ Provisioning completed for ${client.company_name}`);
    return {
      rawApiKey: ctx.rawApiKey,
      frontendUrl: ctx.frontendSubdomain,
      backendUrl: ctx.backendSubdomain,
    };
  } catch (err: any) {
    console.error(
      `❌ Provisioning failed for ${client.company_name}:`,
      err.message,
    );

    client.provisioning_status = "failed";
    client.provisioning_error = err.message;
    await client.save().catch(() => {});

    await rollback(ctx);
    throw err;
  }
}

// ============================================================================
// 🧪 DEV MODE Simulation
// ============================================================================

async function simulateProvisioning(client: any) {
  const ctx: ProvisionContext = {
    clientId: client._id.toString(),
    subdomain: client.subdomain,
    dbName: `sc_${client._id}`,
    completed: [],
  };

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    // 1. Tenant DB (real — أنشئها فعلاً في MongoDB لأنها مش محتاجة Plesk)
    await setProvisioningStatus(ctx.clientId, "creating_db");
    await delay(600);
    await createTenantDatabase(ctx.dbName, client);
    ctx.completed.push("db");
    console.log(`🧪 [DEV] DB created: ${ctx.dbName}`);

    // 2. Subdomains (fake)
    await setProvisioningStatus(ctx.clientId, "creating_subdomain");
    await delay(600);
    ctx.frontendSubdomain = `${ctx.subdomain}.${env.PLESK_PARENT_DOMAIN}`;
    ctx.backendSubdomain = `api-${ctx.subdomain}.${env.PLESK_PARENT_DOMAIN}`;
    ctx.completed.push("subdomains");
    console.log(
      `🧪 [DEV] Subdomains simulated: ${ctx.frontendSubdomain}, ${ctx.backendSubdomain}`,
    );

    // 3. Files (skip — بس سجّلها)
    await setProvisioningStatus(ctx.clientId, "deploying");
    await delay(600);
    ctx.completed.push("files");
    console.log(`🧪 [DEV] Files deployment simulated`);

    // 4. API Key (real — لأننا هنستخدمها في tenant/verify)
    await setProvisioningStatus(ctx.clientId, "generating_key");
    await delay(400);
    ctx.rawApiKey = await generateTenantApiKey(ctx.clientId);
    ctx.completed.push("apiKey");
    console.log(`🧪 [DEV] API Key generated: ${ctx.rawApiKey.slice(0, 20)}...`);

    // 5. Backend .env (skip — بس سجّلها)
    ctx.completed.push("backendEnv");
    console.log(`🧪 [DEV] Backend .env write simulated`);

    // 6. Subscription (real)
    await setProvisioningStatus(ctx.clientId, "creating_subscription");
    await delay(400);
    await createInitialSubscription(
      ctx.clientId,
      (client.package_id as any)._id,
    );
    ctx.completed.push("subscription");
    console.log(`🧪 [DEV] Subscription created`);

    // 7. SSL (skip)
    await setProvisioningStatus(ctx.clientId, "installing_ssl");
    await delay(300);
    ctx.completed.push("ssl");
    console.log(`🧪 [DEV] SSL install simulated`);

    // 8. Finalize
    client.subdomain_url = `https://${ctx.frontendSubdomain}`;
    client.backend_url = `https://${ctx.backendSubdomain}`;
    client.db_name = ctx.dbName;
    client.status = "active";
    client.provisioning_status = "completed";
    client.provisioning_error = undefined;
    await client.save();

    console.log(
      `🧪 [DEV] ✅ Provisioning simulated for ${client.company_name}`,
    );
    return {
      rawApiKey: ctx.rawApiKey,
      frontendUrl: ctx.frontendSubdomain,
      backendUrl: ctx.backendSubdomain,
    };
  } catch (err: any) {
    console.error(`🧪 [DEV] ❌ Simulation failed:`, err.message);
    client.provisioning_status = "failed";
    client.provisioning_error = err.message;
    await client.save().catch(() => {});
    await rollback(ctx);
    throw err;
  }
}

// ============================================================================
// Steps
// ============================================================================

async function setProvisioningStatus(clientId: string, status: string) {
  console.log(`[Provision] → ${status}`);
  await ClientModel.findByIdAndUpdate(clientId, {
    provisioning_status: status,
  });
}

async function createTenantDatabase(dbName: string, client: any) {
  console.log(`[Provision] Creating tenant DB: ${dbName}`);

  const conn = mongoose.connection.useDb(dbName, { useCache: true });

  // Metadata
  await conn.createCollection("metadata").catch(() => {});
  await conn.collection("metadata").insertOne({
    client_id: client._id,
    company_name: client.company_name,
    created_at: new Date(),
  });

  // Seed admin user
  await conn.createCollection("users").catch(() => {});
  await conn.collection("users").insertOne({
    username: "admin",
    email: client.email,
    password_hash: client.password, // already hashed by Client pre-save
    company_name: client.company_name,
    phone: "0000000000",
    role: "superadmin",
    status: "active",
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Provision] DB ${dbName} created and seeded`);
}

async function deployFiles(ctx: ProvisionContext) {
  const frontendDir = path.join(env.PLESK_VHOSTS_DIR, ctx.subdomain);
  const backendDir = path.join(env.PLESK_VHOSTS_DIR, `api-${ctx.subdomain}`);

  // -------- Frontend --------
  console.log(`[Provision] Copying frontend → ${frontendDir}`);
  await copyDir(env.MASTER_FRONTEND_DIR, frontendDir);
  await writeFrontendHtaccess(frontendDir);

  // Inject API URL into compiled bundles
  await injectApiUrlIntoBundle(frontendDir, `https://${ctx.backendSubdomain}`);

  // -------- Backend --------
  console.log(`[Provision] Copying backend → ${backendDir}`);
  await copyDir(env.MASTER_BACKEND_DIR, backendDir);
  await writeAppJsShim(backendDir);
  await copyNodeModules(backendDir);
  await chownPleskUser(backendDir);

  // Enable Node.js for backend subdomain
  const apiSub = `api-${ctx.subdomain}.${env.PLESK_PARENT_DOMAIN}`;
  console.log(`[Provision] Enabling Node.js for ${apiSub}`);
  await executePleskCli("extension", [
    "--call",
    "nodejs",
    "--enable",
    "-domain",
    apiSub,
  ]);

  // Disable nginx proxy (recommended for Node apps in Plesk)
  await executePleskCli("domain", [
    "--update-web-server-settings",
    apiSub,
    "-nginx-proxy-mode",
    "false",
  ]).catch((err) =>
    console.warn(`[Provision] nginx-proxy-mode toggle failed: ${err.message}`),
  );
}

async function generateTenantApiKey(clientId: string): Promise<string> {
  const raw = `sk_${crypto.randomUUID()}_${crypto.randomBytes(16).toString("hex")}`;
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");

  await TenantApiKeyModel.create({
    client_id: clientId,
    hashedKey: hashed,
    label: "default",
    active: true,
  });

  console.log(`[Provision] Tenant API key generated`);
  return raw;
}

async function writeBackendEnv(ctx: ProvisionContext) {
  const backendDir = path.join(env.PLESK_VHOSTS_DIR, `api-${ctx.subdomain}`);

  await generateBackendEnv(backendDir, {
    clientName: ctx.subdomain,
    frontendUrl: ctx.frontendSubdomain!,
    dbName: ctx.dbName,
    superApiKey: ctx.rawApiKey!,
  });
}

async function createInitialSubscription(clientId: string, packageId: string) {
  const start = new Date();
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1); // سنة

  await SubscriptionModel.create({
    client_id: clientId,
    package_id: packageId,
    start_date: start,
    end_date: end,
    status: "active",
  });

  console.log(`[Provision] Subscription created until ${end.toISOString()}`);
}

async function installSslSafe(frontendSub: string, backendSub: string) {
  const email = env.SSL_ADMIN_EMAIL;
  if (!email) {
    console.warn("[Provision] SSL skipped: SSL_ADMIN_EMAIL not set");
    return;
  }

  for (const sub of [frontendSub, backendSub]) {
    try {
      console.log(`[Provision] Installing SSL for ${sub}...`);
      await executePleskCli("extension", [
        "--exec",
        "letsencrypt",
        "cli.php",
        "-d",
        sub,
        "-m",
        email,
      ]);
      console.log(`[Provision] ✅ SSL installed for ${sub}`);
    } catch (err: any) {
      console.warn(
        `[Provision] ⚠️ SSL install failed for ${sub}: ${err.message}`,
      );
    }
  }
}

// ============================================================================
// File helpers
// ============================================================================

async function copyDir(src: string, dest: string) {
  try {
    await fs.access(src);
  } catch {
    throw new Error(`Master directory not found: ${src}`);
  }

  await fs.cp(src, dest, {
    recursive: true,
    force: true,
    filter: (source) => {
      const name = path.basename(source);
      return !["node_modules", ".git", "tmp", ".vite", "dist_cache"].includes(
        name,
      );
    },
  });
}

async function copyNodeModules(backendDir: string) {
  const masterNodeModules = path.join(env.MASTER_BACKEND_DIR, "node_modules");
  const targetDir = path.join(backendDir, "node_modules");

  try {
    await fs.access(masterNodeModules);
  } catch {
    console.warn("[Provision] Master node_modules not found — skipping");
    return;
  }

  console.log(`[Provision] Copying node_modules (cp -a)...`);
  await execAsync(`cp -a ${masterNodeModules} ${backendDir}/`);
  console.log(`[Provision] node_modules copied to ${targetDir}`);
}

async function chownPleskUser(dir: string) {
  const user = env.PLESK_SYSTEM_USER;
  if (!user) {
    console.warn("[Provision] PLESK_SYSTEM_USER not set — skipping chown");
    return;
  }
  console.log(`[Provision] chown -R ${user}:psacln ${dir}`);
  await execAsync(`chown -R ${user}:psacln ${dir}`);
}

async function writeAppJsShim(backendDir: string) {
  const appJsPath = path.join(backendDir, "app.js");
  const lines = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const logFile = path.join(__dirname, 'startup-error.log');",
    "",
    "process.on('uncaughtException', (err) => {",
    "    const msg = new Date().toISOString() + ' [UNCAUGHT] ' + err.stack + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "    console.error(msg);",
    "});",
    "",
    "process.on('unhandledRejection', (reason) => {",
    "    const msg = new Date().toISOString() + ' [UNHANDLED] ' + String(reason) + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "});",
    "",
    "try {",
    "    require('./dist/src/server.js');",
    "} catch (err) {",
    "    const msg = new Date().toISOString() + ' [STARTUP] ' + err.stack + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "    console.error(msg);",
    "    process.exit(1);",
    "}",
    "",
  ];
  await fs.writeFile(appJsPath, lines.join("\n"), "utf-8");
}

async function writeFrontendHtaccess(dir: string) {
  const htaccess = `# wego multi-tenant SPA routing
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Point of Sale SPA
    RewriteCond %{REQUEST_URI} ^/point-of-sale/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^point-of-sale/(.*)$ /point-of-sale/index.html [L]

    # Admin Login SPA
    RewriteCond %{REQUEST_URI} ^/admin-login/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^admin-login/(.*)$ /admin-login/index.html [L]

    # Ecommerce SPA
    RewriteCond %{REQUEST_URI} ^/ecommerce/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ecommerce/(.*)$ /ecommerce/index.html [L]

    # Root fallback
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ /index.html [L]
</IfModule>
`;
  await fs.writeFile(path.join(dir, ".htaccess"), htaccess, "utf-8");
}

async function generateBackendEnv(
  backendDir: string,
  opts: {
    clientName: string;
    frontendUrl: string;
    dbName: string;
    superApiKey: string;
  },
) {
  const envPath = path.join(backendDir, ".env");
  const jwtSecret = crypto.randomBytes(32).toString("hex");

  const dbUser = env.MONGO_TENANT_USER;
  const dbPass = encodeURIComponent(env.MONGO_TENANT_PASS);

  const lines = [
    `# Auto-generated for ${opts.clientName}`,
    `NODE_ENV=production`,
    `PORT=3000`,
    ``,
    `FRONTEND_URL=https://${opts.frontendUrl}`,
    `JWT_SECRET=${jwtSecret}`,
    ``,
    `SUPER_SYSTEGO_URL=${env.SUPER_SYSTEGO_URL}`,
    `SUPER_SYSTEGO_API_KEY=${opts.superApiKey}`,
    ``,
    `VERSION_UPDATER_URL=${env.VERSION_UPDATER_URL}`,
    `VERSION_UPDATER_API_KEY=${env.VERSION_UPDATER_API_KEY}`,
    ``,
    `MongoDB_URI=mongodb://${dbUser}:${dbPass}@127.0.0.1:27017/${opts.dbName}?authSource=admin`,
    ``,
  ];

  await fs.writeFile(envPath, lines.join("\n"), "utf-8");
  console.log(`[Provision] Backend .env written (${envPath})`);
}

async function injectApiUrlIntoBundle(dir: string, newApiUrl: string) {
  const oldUrl = "https://back.wego.org";

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (
        e.isFile() &&
        (e.name.endsWith(".js") ||
          e.name.endsWith(".html") ||
          e.name.endsWith(".json"))
      ) {
        try {
          let content = await fs.readFile(full, "utf8");
          if (content.toLowerCase().includes(oldUrl.toLowerCase())) {
            const regex = new RegExp(
              oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "gi",
            );
            content = content.replace(regex, newApiUrl);
            await fs.writeFile(full, content, "utf8");
            console.log(`[Provision] Injected API URL into ${e.name}`);
          }
        } catch (err: any) {
          console.warn(`[Provision] Skipping ${e.name}: ${err.message}`);
        }
      }
    }
  }

  await walk(dir);
}

// ============================================================================
// Rollback
// ============================================================================

async function rollback(ctx: ProvisionContext) {
  console.warn(`[Rollback] Starting for client ${ctx.clientId}`);
  const steps = [...ctx.completed].reverse();

  for (const step of steps) {
    try {
      switch (step) {
        case "backendEnv":
          await fs
            .rm(
              path.join(env.PLESK_VHOSTS_DIR, `api-${ctx.subdomain}`, ".env"),
              {
                force: true,
              },
            )
            .catch(() => {});
          break;

        case "apiKey":
          await TenantApiKeyModel.updateMany(
            { client_id: ctx.clientId, active: true },
            { $set: { active: false } },
          );
          break;

        case "subscription":
          await SubscriptionModel.deleteMany({ client_id: ctx.clientId });
          break;

        case "files":
          await fs
            .rm(path.join(env.PLESK_VHOSTS_DIR, ctx.subdomain), {
              recursive: true,
              force: true,
            })
            .catch(() => {});
          await fs
            .rm(path.join(env.PLESK_VHOSTS_DIR, `api-${ctx.subdomain}`), {
              recursive: true,
              force: true,
            })
            .catch(() => {});
          break;

        case "subdomains":
          await deleteSubdomain(ctx.subdomain).catch((err) =>
            console.warn(
              `[Rollback] deleteSubdomain(${ctx.subdomain}) failed: ${err.message}`,
            ),
          );
          await deleteSubdomain(`api-${ctx.subdomain}`).catch((err) =>
            console.warn(
              `[Rollback] deleteSubdomain(api-${ctx.subdomain}) failed: ${err.message}`,
            ),
          );
          break;

        case "db":
          await mongoose.connection
            .useDb(ctx.dbName, { useCache: false })
            .dropDatabase()
            .catch((err) =>
              console.warn(`[Rollback] dropDatabase failed: ${err.message}`),
            );
          break;
      }
      console.log(`[Rollback] ✅ ${step}`);
    } catch (err: any) {
      console.error(`[Rollback] ❌ ${step}: ${err.message}`);
    }
  }

  console.warn(`[Rollback] Done for ${ctx.clientId}`);
}
