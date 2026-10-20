import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === "") throw new Error(`❌ Missing env var: ${key}`);
  return v;
}
function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: Number(optional("PORT", "3000")),

  MONGO_URI: required("MONGO_URI"),

  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "1d"),

  SUPER_ADMIN_EMAIL: required("SUPER_ADMIN_EMAIL"),
  SUPER_ADMIN_PASSWORD: required("SUPER_ADMIN_PASSWORD"),
  SUPER_ADMIN_NAME: optional("SUPER_ADMIN_NAME", "Super Admin"),

  PLESK_HOST: optional("PLESK_HOST"),
  PLESK_PORT: optional("PLESK_PORT", "8443"),
  PLESK_API_KEY: optional("PLESK_API_KEY"),
  PLESK_PARENT_DOMAIN: optional("PLESK_PARENT_DOMAIN"),
  PLESK_VHOSTS_DIR: optional("PLESK_VHOSTS_DIR"),
  MASTER_FRONTEND_DIR: optional("MASTER_FRONTEND_DIR"),
  MASTER_BACKEND_DIR: optional("MASTER_BACKEND_DIR"),
  PLESK_SYSTEM_USER: optional("PLESK_SYSTEM_USER"),

  // ---- Plesk MongoDB (tenant DBs تُنشأ هنا — مش على Atlas) ----
  PLESK_MONGO_URI: optional("PLESK_MONGO_URI", "mongodb://127.0.0.1:27017"),
  PLESK_MONGO_USER: optional("PLESK_MONGO_USER", ""),
  PLESK_MONGO_PASS: optional("PLESK_MONGO_PASS", ""),
  TENANT_DB_PREFIX: optional("TENANT_DB_PREFIX", "sc_"),

  // legacy / اختياري — لو موجود بيُستخدم كـ fallback فقط
  TENANT_MONGO_URI: optional("TENANT_MONGO_URI", ""),
  MONGO_TENANT_USER: optional("MONGO_TENANT_USER", "admin"),
  MONGO_TENANT_PASS: optional("MONGO_TENANT_PASS", ""),

  SUPER_SYSTEGO_URL:
    optional("SUPER_SYSTEGO_URL") || optional("SUPER_WEGZ_URL"),
  SUPER_FRONTEND_URL: optional("SUPER_FRONTEND_URL", ""), // ← جديد
  VERSION_UPDATER_URL: optional("VERSION_UPDATER_URL"),
  VERSION_UPDATER_API_KEY: optional("VERSION_UPDATER_API_KEY"),

  SSL_ADMIN_EMAIL: optional("SSL_ADMIN_EMAIL"),

  // ---- Finance / Reports ----
  CURRENCY: optional("CURRENCY", "EGP"),
  TIMEZONE: optional("TIMEZONE", "Africa/Cairo"),
  INVOICE_PREFIX: optional("INVOICE_PREFIX", "WEGZ"),
} as const;
