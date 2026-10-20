import mongoose from "mongoose";
import { env } from "./env";

let tenantClusterConnection: mongoose.Connection | null = null;

/**
 * يبني URI للـ Plesk MongoDB (قاعدة بيانات العملاء).
 * - لو PLESK_MONGO_URI فيه credentials أصلاً → يُستخدم كما هو.
 * - لو PLESK_MONGO_USER موجود → يحقن الـ credentials.
 */
function buildPleskMongoUri(): string {
  let uri = env.PLESK_MONGO_URI || env.TENANT_MONGO_URI || env.MONGO_URI;

  if (env.PLESK_MONGO_USER) {
    const user = encodeURIComponent(env.PLESK_MONGO_USER);
    const pass = encodeURIComponent(env.PLESK_MONGO_PASS || "");
    // نحقن الـ credentials فقط لو مش موجودة بالفعل
    if (!/^mongodb(\+srv)?:\/\/[^/@]+@/.test(uri)) {
      uri = uri.replace(/^mongodb(\+srv)?:\/\//, `mongodb$1://${user}:${pass}@`);
    }

    // أغلب يوزرات MongoDB على Plesk بتتعمل في admin DB
    if (!/[?&]authSource=/.test(uri)) {
      uri += (uri.includes("?") ? "&" : "?") + "authSource=admin";
    }
  }

  return uri;
}

/**
 * يرجع connection string كامل لقاعدة بيانات عميل معيّن على Plesk.
 * مثال: mongodb://127.0.0.1:27017/sc_507f1f77bcf86cd799439011
 */
export function getTenantMongoUri(dbName: string): string {
  const baseUri = buildPleskMongoUri();

  const qIndex = baseUri.indexOf("?");
  const query = qIndex >= 0 ? baseUri.slice(qIndex) : "";
  const withoutQuery = qIndex >= 0 ? baseUri.slice(0, qIndex) : baseUri;

  // نحتفظ بالـ scheme + authority فقط ونستبدل الـ path باسم الداتابيز
  const schemeEnd = withoutQuery.indexOf("://");
  const authorityStart = schemeEnd >= 0 ? schemeEnd + 3 : 0;
  const slashAfterAuthority = withoutQuery.indexOf("/", authorityStart);
  const authority =
    slashAfterAuthority === -1
      ? withoutQuery
      : withoutQuery.slice(0, slashAfterAuthority);

  return `${authority.replace(/\/+$/, "")}/${dbName}${query}`;
}

/**
 * يتصل بـ MongoDB الموجود على سيرفر Plesk (مرة واحدة ويُعاد استخدام الاتصال).
 */
export async function getTenantClusterConnection(): Promise<mongoose.Connection> {
  if (tenantClusterConnection && tenantClusterConnection.readyState === 1) {
    return tenantClusterConnection;
  }

  try {
    tenantClusterConnection = mongoose.createConnection(buildPleskMongoUri());
    await tenantClusterConnection.asPromise();
    console.log("✅ Connected to Plesk MongoDB (tenant databases)");
    return tenantClusterConnection;
  } catch (err: any) {
    if (tenantClusterConnection) {
      await tenantClusterConnection.close().catch(() => {});
      tenantClusterConnection = null;
    }
    console.error("❌ Failed to connect to Plesk MongoDB:", err.message);
    throw new Error(
      `Cannot connect to Plesk MongoDB at "${env.PLESK_MONGO_URI}". ` +
        `اتأكد إن MongoDB شغال على السيرفر وإن PLESK_MONGO_URI صح. (${err.message})`,
    );
  }
}

/**
 * يرجع قاعدة بيانات العميل (ويُنشئها تلقائيًا عند أول كتابة).
 */
export async function getTenantDatabase(
  dbName: string,
): Promise<mongoose.Connection> {
  const clusterConn = await getTenantClusterConnection();
  return clusterConn.useDb(dbName, { useCache: true });
}
