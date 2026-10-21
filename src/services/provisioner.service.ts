import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { env } from "../config/env";
import { ClientModel } from "../models/Client";
import { TenantApiKeyModel } from "../models/TenantApiKey";
import {
  createSubdomain,
  deleteSubdomain,
  executePleskCli,
} from "./plesk.service";
import { getTenantDatabase, getTenantMongoUri } from "../config/tenantDb";

const execAsync = promisify(exec);

interface ProvisionContext {
  clientId: string;
  subdomain: string;
  dbName: string;
  frontendSubdomain?: string;
  backendSubdomain?: string;
  rawApiKey?: string;
  dbExisted?: boolean;
  completed: string[];
}

// ============================================================================
// Main entry
// ============================================================================

export async function provisionClient(clientId: string) {
  const client = await ClientModel.findById(clientId).select("+password");
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
    dbName: `${env.TENANT_DB_PREFIX}${client._id}`,
    completed: [],
  };

  try {
    // 1. Tenant DB (على MongoDB الموجود على سيرفر Plesk)
    await setProvisioningStatus(clientId, "creating_db");
    ctx.dbExisted = await createTenantDatabase(ctx.dbName, client);
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

    // 6. Finalize DB record (استخدم findByIdAndUpdate لتفادي أخطاء الـ validation على حقل الباسورد)
    await ClientModel.findByIdAndUpdate(clientId, {
      subdomain_url: `https://${ctx.frontendSubdomain}`,
      backend_url: `https://${ctx.backendSubdomain}`,
      db_name: ctx.dbName,
      status: "active",
      provisioning_status: "completed",
      provisioning_error: null,
    });

    // 7. Enable Node.js + issue SSL + fix permissions + restart.
    //    This step restarts the web server (Plesk reconfigures the vhost), which kills
    //    this Node process because the super backend itself runs under Passenger.
    //    So it is executed by a temporary server-wide scheduled task (outside Passenger),
    //    AFTER the client is already marked as completed. Best effort, idempotent.
    try {
      await finalizeTenant(ctx);
    } catch (err: any) {
      console.warn(
        `[Provision] Finalize task notice for ${ctx.subdomain}: ${err.message} (task continues on the server)`,
      );
    }

    console.log(`✅ Provisioning completed for ${client.company_name}`);
    return {
      rawApiKey: ctx.rawApiKey,
      frontendUrl: ctx.frontendSubdomain,
      backendUrl: ctx.backendSubdomain,
    };
  } catch (err: any) {
    console.error(
      `❌ Provisioning failed for ${client.company_name}:`,
      err.message || err,
    );

    // احفظ حالة الفشل والرسالة في الداتابيز حتى لا يظل معلقاً في pending
    await ClientModel.findByIdAndUpdate(clientId, {
      provisioning_status: "failed",
      provisioning_error: err.message || String(err),
    }).catch((saveErr) => {
      console.error("Failed to update status to failed in DB:", saveErr);
    });

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
    dbName: `${env.TENANT_DB_PREFIX}${client._id}`,
    completed: [],
  };

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    // 1. Tenant DB (real — على MongoDB بتاع Plesk)
    await setProvisioningStatus(ctx.clientId, "creating_db");
    await delay(600);
    ctx.dbExisted = await createTenantDatabase(ctx.dbName, client);
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

    // 6. SSL (skip)
    await setProvisioningStatus(ctx.clientId, "installing_ssl");
    await delay(300);
    ctx.completed.push("ssl");
    console.log(`🧪 [DEV] SSL install simulated`);

    // 7. Finalize
    await ClientModel.findByIdAndUpdate(ctx.clientId, {
      subdomain_url: `https://${ctx.frontendSubdomain}`,
      backend_url: `https://${ctx.backendSubdomain}`,
      db_name: ctx.dbName,
      status: "active",
      provisioning_status: "completed",
      provisioning_error: null,
    });

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
    await ClientModel.findByIdAndUpdate(ctx.clientId, {
      provisioning_status: "failed",
      provisioning_error: err.message || String(err),
    }).catch(() => {});
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

async function createTenantDatabase(
  dbName: string,
  client: any,
): Promise<boolean> {
  console.log(`[Provision] Creating tenant DB on Plesk MongoDB: ${dbName}`);

  const conn = await getTenantDatabase(dbName);
  const db = conn.getClient().db(dbName);

  // هل الداتابيز كانت موجودة قبل كده؟ (مهم عشان الـ rollback ميمسحش بيانات)
  const existingCollections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  const existed = existingCollections.length > 0;

  // Metadata — idempotent (لو موجودة من ترحيل أو retry، منكررهاش)
  await conn.createCollection("metadata").catch(() => {});
  const metadataExists =
    (await conn.collection("metadata").countDocuments({})) > 0;

  if (!metadataExists) {
    await conn.collection("metadata").insertOne({
      client_id: client._id,
      company_name: client.company_name,
      created_at: new Date(),
    });
  } else {
    console.log(`[Provision] metadata already exists in ${dbName} — kept`);
  }

  // Seed admin user — idempotent (مطابق لموديل المستخدم في wegz-backend)
  await conn.createCollection("users").catch(() => {});
  const adminExists =
    (await conn.collection("users").countDocuments({ email: client.email })) > 0;

  if (!adminExists) {
    await conn.collection("users").insertOne({
      name: client.company_name,
      email: client.email,
      phone: client.sales_man_phone || "0000000000",
      password: client.password, // bcrypt hash already applied by Client pre-save
      role: "admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    console.log(`[Provision] tenant admin already exists in ${dbName} — kept`);
  }

  // Seed default themes — idempotent (بدونها لوحة التحكم تبدأ فاضية)
  await conn.createCollection("themes").catch(() => {});
  const themesExist = (await conn.collection("themes").countDocuments({})) > 0;

  if (!themesExist) {
    await conn.collection("themes").insertMany([
      {
        name: "Theme 1",
        description: "",
        isActive: true,
        activeMode: "light",
        availableModes: ["dark", "light"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Theme 2",
        description: "",
        isActive: false,
        activeMode: "light",
        availableModes: ["dark", "light"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }

  console.log(
    `[Provision] DB ${dbName} ${existed ? "already existed" : "created"} and ready`,
  );

  return existed;
}

async function deployFiles(ctx: ProvisionContext) {
  if (!env.MASTER_FRONTEND_DIR || !env.MASTER_BACKEND_DIR || !env.PLESK_VHOSTS_DIR) {
    throw new Error(
      "Missing configuration: MASTER_FRONTEND_DIR, MASTER_BACKEND_DIR, and PLESK_VHOSTS_DIR must be set in .env",
    );
  }

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

  // NOTE: enabling Node.js and issuing SSL are intentionally NOT done here.
  // They reconfigure the vhost and restart the web server, which kills this process
  // (the super backend runs under Passenger). They run in finalizeTenant() instead.
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

/**
 * Final tenant steps that MUST run outside the Passenger process group:
 *   - enable Node.js (Plesk reconfigures the vhost → restarts the web server)
 *   - issue Let's Encrypt certificates for the frontend/backend subdomains
 *   - fix file permissions so nginx can read the new vhost
 *   - restart the tenant app
 *
 * They are executed by a temporary server-wide root scheduled task. The scheduled
 * task is not a child of this Node process, so it survives the web server restart.
 *
 * Idempotent: safe to re-run (enable, sslit reissue, chmod, restart).
 */
async function finalizeTenant(ctx: ProvisionContext) {
  const frontendSub = ctx.frontendSubdomain!;
  const backendSub = ctx.backendSubdomain!;
  const vhosts = env.PLESK_VHOSTS_DIR!;
  const frontendDir = path.join(vhosts, ctx.subdomain);
  const backendDir = path.join(vhosts, `api-${ctx.subdomain}`);
  const nodeVersion = process.env.TENANT_NODE_VERSION || "22.23.3";

  const fixPerms = async () => {
    try {
      await execAsync(`chmod -R a+rX "${frontendDir}" "${backendDir}"`);
    } catch (err: any) {
      console.warn(`[Provision] chmod warning: ${err.message}`);
    }
  };

  await fixPerms();
  await fs.mkdir(path.join(backendDir, "tmp"), { recursive: true });

  // Enabling Node.js reconfigures the vhost and restarts the web server.
  // This runs in the detached provisioning process (not under Passenger), so it survives.
  console.log(`[Provision] Enabling Node.js ${nodeVersion} for ${backendSub}`);
  await executePleskCli("extension", [
    "--call",
    "nodejs",
    "--enable",
    "-domain",
    backendSub,
    "-version",
    nodeVersion,
  ]);

  // Valid TLS is required, otherwise browsers block the frontend→backend requests
  // (preflight fails and shows up as a misleading CORS error).
  for (const sub of [frontendSub, backendSub]) {
    try {
      console.log(`[Provision] Issuing SSL for ${sub}`);
      await executePleskCli("extension", [
        "--call",
        "sslit",
        "--certificate",
        "-issue",
        "-domain",
        sub,
        "-secure-domain",
      ]);
    } catch (err: any) {
      console.warn(`[Provision] SSL issue failed for ${sub}: ${err.message}`);
    }
  }

  await fixPerms();
  await fs.writeFile(path.join(backendDir, "tmp", "restart.txt"), "", "utf-8");
}

/**
 * Runs provisioning outside the super backend process (Passenger).
 *
 * Creating subdomains / enabling Node.js / issuing SSL all make Plesk reconfigure
 * the web server. When provisioning runs inside the super backend, that restart
 * kills the provisioning job halfway through (status stuck on "creating_subdomain").
 *
 * So we start a one-shot server-wide scheduled task (root) which executes the
 * built provisioning entrypoint as the subscription user:
 *     node dist/scripts/provision.js <clientId>
 * That process is independent from Apache/Passenger and runs to completion.
 */
export async function spawnProvisioningTask(clientId: string) {
  const vhosts = env.PLESK_VHOSTS_DIR;
  if (!vhosts) throw new Error("PLESK_VHOSTS_DIR is not configured");

  const tmpDir = path.join(vhosts, "tmp");
  const scriptPath = path.join(tmpDir, `provision-${clientId}.sh`);
  const logPath = path.join(tmpDir, `provision-${clientId}.log`);
  const appDir = path.join(vhosts, "superback.wegz.org");
  const nodeBin = process.env.TENANT_NODE_BIN || "/opt/plesk/node/22/bin/node";
  const systemUser = env.PLESK_SYSTEM_USER || "wegz";

  await fs.mkdir(tmpDir, { recursive: true });

  const writeScript = async (taskId?: string) => {
    const script = `#!/bin/bash
# Auto-generated provisioning runner for client ${clientId}
LOG="${logPath}"
{
  echo "== provisioning start $(date -Is) =="
  su -s /bin/bash ${systemUser} -c 'cd "${appDir}" && ${nodeBin} dist/scripts/provision.js ${clientId}'
  echo "provision rc=$?"
  echo "== provisioning end $(date -Is) =="
} >> "$LOG" 2>&1
${taskId ? `/usr/local/psa/bin/scheduler --delete ${taskId} >> "$LOG" 2>&1` : ""}
`;
    await fs.writeFile(scriptPath, script, { encoding: "utf-8", mode: 0o700 });
    await fs.chmod(scriptPath, 0o700).catch(() => {});
  };

  // Script without the self-delete line first, because the task id is unknown yet.
  await writeScript();

  const created = await executePleskCli("scheduler", [
    "--create",
    "-user",
    "root",
    "-type",
    "exec",
    "-command",
    `bash ${scriptPath}`,
    "-schedule",
    "0 0 1 1 *",
    "-description",
    `provision ${clientId}`,
    "-notify",
    "ignore",
    "-active",
    "true",
  ]);

  const taskId = String(created?.stdout || "").match(/ID:\s*(\d+)/)?.[1];
  if (!taskId) {
    throw new Error(
      `Could not create provisioning task (scheduler output: ${JSON.stringify(created?.stdout)})`,
    );
  }

  // Add self-cleanup now that the id is known, then start it.
  await writeScript(taskId);

  console.log(`[Provision] Started detached provisioning task ${taskId} for ${clientId}`);
  executePleskCli("scheduler", ["--run", taskId]).catch((err: any) => {
    // A web server restart during provisioning can drop this HTTP call.
    // The scheduled task keeps running regardless.
    console.warn(`[Provision] Task ${taskId} call ended: ${err.message}`);
  });
}

// ============================================================================
// File helpers
// ============================================================================

async function copyDir(src: string, dest: string) {
  try {
    await fs.access(src);
  } catch {
    throw new Error(
      `Master directory not found: "${src}". Please verify MASTER_FRONTEND_DIR / MASTER_BACKEND_DIR in .env exist on this server.`,
    );
  }

  // Ensure destination directory exists
  await fs.mkdir(dest, { recursive: true });

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
  const targetNodeModules = path.join(backendDir, "node_modules");

  try {
    await fs.access(masterNodeModules);
  } catch {
    console.warn(
      `[Provision] Master node_modules not found at "${masterNodeModules}" — skipping`,
    );
    return;
  }

  // امسح أي node_modules قديم (لو موجود)
  try {
    await fs.rm(targetNodeModules, { recursive: true, force: true });
  } catch {}

  // حاول عمل symlink (فوري بدل نسخ مئات الميجابايتس)، مع fallback للنسخ
  try {
    await fs.symlink(masterNodeModules, targetNodeModules);
    console.log(`[Provision] ✅ Symlinked node_modules → ${masterNodeModules}`);
  } catch (err: any) {
    console.warn(
      `[Provision] Symlink failed (${err.message}), falling back to direct copy...`,
    );
    try {
      await fs.cp(masterNodeModules, targetNodeModules, { recursive: true });
      console.log(`[Provision] ✅ Copied node_modules successfully`);
    } catch (copyErr: any) {
      console.warn(
        `[Provision] Direct node_modules copy also failed: ${copyErr.message}`,
      );
    }
  }
}

async function chownPleskUser(dir: string) {
  const user = env.PLESK_SYSTEM_USER;
  if (!user) {
    console.warn("[Provision] PLESK_SYSTEM_USER not set — skipping chown");
    return;
  }
  try {
    console.log(`[Provision] chown -R ${user}:psacln ${dir}`);
    await execAsync(`chown -R ${user}:psacln ${dir}`);
  } catch (err: any) {
    // المستخدم العادي في لينكس غير مسموح له بـ chown (EPERM).
    // طالما التطبيق يعمل بنفس حساب المستخدم، الملفات مملوكة له بالفعل.
    console.warn(
      `[Provision] chown notice: ${err.message} (safe to ignore if running as subscription user)`,
    );
  }
}

async function writeAppJsShim(backendDir: string) {
  const appJsPath = path.join(backendDir, "app.js");

  // اكتشف نوع الموديول من package.json (wegz-backend = ESM، Systego = CJS)
  let isEsm = false;
  try {
    const pkgRaw = await fs.readFile(
      path.join(backendDir, "package.json"),
      "utf-8",
    );
    isEsm = JSON.parse(pkgRaw)?.type === "module";
  } catch {
    // لو مش قادر يقرأ package.json، افترض CJS
  }

  // IMPORTANT: no top-level await here.
  // Plesk/Passenger loads app.js with require(), and require() cannot load an ESM
  // graph that contains top-level await (ERR_REQUIRE_ASYNC_MODULE). The entry file
  // is loaded with a fire-and-forget dynamic import instead.
  const esmLines = [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { fileURLToPath, pathToFileURL } from 'node:url';",
    "",
    "const __dirname = path.dirname(fileURLToPath(import.meta.url));",
    "const logFile = path.join(__dirname, 'startup-error.log');",
    "",
    "const logError = (tag, err) => {",
    "    const msg = new Date().toISOString() + ' [' + tag + '] ' + ((err && err.stack) || err) + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "    console.error(msg);",
    "};",
    "",
    "process.on('uncaughtException', (err) => logError('UNCAUGHT', err));",
    "process.on('unhandledRejection', (reason) => logError('UNHANDLED', reason));",
    "",
    "const candidates = ['./dist/server.js', './dist/src/server.js', './dist/index.js'];",
    "const entry = candidates",
    "    .map((rel) => path.join(__dirname, rel))",
    "    .find((full) => fs.existsSync(full));",
    "",
    "if (!entry) {",
    "    logError('STARTUP', new Error('Server entry file not found in ./dist/ (looked for dist/server.js, dist/src/server.js, dist/index.js)'));",
    "    process.exit(1);",
    "}",
    "",
    "import(pathToFileURL(entry).href).catch((err) => {",
    "    logError('STARTUP', err);",
    "    process.exit(1);",
    "});",
    "",
  ];

  const cjsLines = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const logFile = path.join(__dirname, 'startup-error.log');",
    "",
    "process.on('uncaughtException', (err) => {",
    "    const msg = new Date().toISOString() + ' [UNCAUGHT] ' + ((err && err.stack) || err) + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "    console.error(msg);",
    "});",
    "",
    "process.on('unhandledRejection', (reason) => {",
    "    const msg = new Date().toISOString() + ' [UNHANDLED] ' + String(reason) + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "});",
    "",
    "(async () => {",
    "    const candidates = ['./dist/server.js', './dist/src/server.js', './dist/index.js'];",
    "    for (const rel of candidates) {",
    "        const full = path.join(__dirname, rel);",
    "        if (fs.existsSync(full)) {",
    "            await import(full);",
    "            return;",
    "        }",
    "    }",
    "    throw new Error('Server entry file not found in ./dist/ (looked for dist/server.js, dist/src/server.js, dist/index.js)');",
    "})().catch((err) => {",
    "    const msg = new Date().toISOString() + ' [STARTUP] ' + ((err && err.stack) || err) + '\\n';",
    "    try { fs.appendFileSync(logFile, msg); } catch (_) {}",
    "    console.error(msg);",
    "    process.exit(1);",
    "});",
    "",
  ];

  await fs.writeFile(
    appJsPath,
    (isEsm ? esmLines : cjsLines).join("\n"),
    "utf-8",
  );
  console.log(
    `[Provision] app.js shim written (${isEsm ? "ESM" : "CJS"} mode)`,
  );
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
  const tenantMongoUri = getTenantMongoUri(opts.dbName);

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
    `MongoDB_URI=${tenantMongoUri}`,
    `MONGO_URI=${tenantMongoUri}`,
    ``,
  ];

  await fs.writeFile(envPath, lines.join("\n"), "utf-8");
  console.log(`[Provision] Backend .env written (${envPath})`);
}

async function injectApiUrlIntoBundle(dir: string, newApiUrl: string) {
  // الرابط الأصلي الذي تم بناء الماستر فرونت عليه ليتم استبداله برابط باك إند العميل الجديد
  const oldUrl = process.env.MASTER_API_URL || "https://bcknd.wegz.org";

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

        case "db": {
          if (ctx.dbExisted) {
            console.log(
              `[Rollback] DB ${ctx.dbName} existed before provisioning — keeping it`,
            );
            break;
          }

          const conn = await getTenantDatabase(ctx.dbName);
          await conn
            .dropDatabase()
            .catch((err) =>
              console.warn(`[Rollback] dropDatabase failed: ${err.message}`),
            );
          break;
        }
      }
      console.log(`[Rollback] ✅ ${step}`);
    } catch (err: any) {
      console.error(`[Rollback] ❌ ${step}: ${err.message}`);
    }
  }

  console.warn(`[Rollback] Done for ${ctx.clientId}`);
}
