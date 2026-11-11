/**
 * Multi-Tenant Migration Service
 *
 * محرك تشغيل الميجريشنز عبر جميع قواعد بيانات العملاء (Schemas):
 * 1. يتصل بكل قاعدة بيانات عميل (sc_<id>)
 * 2. يقرأ جدول `_migrations` لمعرفة ما تم تطبيقه مسبقاً
 * 3. يطبق "التعديلات الجديدة فقط" بالترتيب الزمني
 * 4. يسجل كل ميجريشن ناجح حتى لا يتم تكراره مستقبلاً
 */
import { ClientModel } from "../models/Client";
import { getTenantDatabase } from "../config/tenantDb";
import { allTenantMigrations, type TenantMigrationResult } from "../migrations";

const MIGRATIONS_COLLECTION = "_migrations";

export interface MigrationSummaryReport {
  totalTenants: number;
  migratedCount: number;
  alreadyUpToDateCount: number;
  failedCount: number;
  totalNewMigrationsApplied: number;
  registeredMigrationsCount: number;
  results: TenantMigrationResult[];
}

export interface TenantMigrationStatusItem {
  tenantId: string;
  subdomain: string;
  dbName: string;
  status: string;
  appliedCount: number;
  pendingCount: number;
  pendingMigrationIds: string[];
  isUpToDate: boolean;
}

/**
 * جلب معرفات الميجريشنز المطبقة بالفعل في قاعدة بيانات الـ tenant
 */
async function getAppliedMigrationIds(conn: any): Promise<Set<string>> {
  try {
    await conn.createCollection(MIGRATIONS_COLLECTION).catch(() => {});
    const records = await conn
      .collection(MIGRATIONS_COLLECTION)
      .find({}, { projection: { id: 1 } })
      .toArray();

    return new Set(records.map((r: any) => String(r.id)));
  } catch {
    return new Set();
  }
}

/**
 * تشغيل الميجريشنز لـ tenant واحد محدد
 */
export async function runMigrationsForTenant(
  tenant: any,
  dryRun = false,
): Promise<TenantMigrationResult> {
  const startTime = Date.now();
  const dbName = tenant.db_name || `sc_${tenant._id.toString()}`;

  const result: TenantMigrationResult = {
    tenantId: tenant._id.toString(),
    subdomain: tenant.subdomain,
    dbName,
    success: true,
    appliedCount: 0,
    newMigrations: [],
    alreadyAppliedCount: 0,
    executionTimeMs: 0,
  };

  try {
    const conn = await getTenantDatabase(dbName);
    const appliedIds = await getAppliedMigrationIds(conn);
    result.alreadyAppliedCount = appliedIds.size;

    // تصفية: استخراج التعديلات الجديدة فقط التي لم تُطبق بعد
    const pendingMigrations = allTenantMigrations.filter(
      (m) => !appliedIds.has(m.id),
    );

    if (pendingMigrations.length === 0) {
      result.executionTimeMs = Date.now() - startTime;
      return result;
    }

    if (dryRun) {
      result.appliedCount = pendingMigrations.length;
      result.newMigrations = pendingMigrations.map((m) => m.id);
      result.executionTimeMs = Date.now() - startTime;
      return result;
    }

    // تطبيق كل ميجريشن جديد بالترتيب
    for (const migration of pendingMigrations) {
      const stepStart = Date.now();
      console.log(
        `[Migration] Running ${migration.id} (${migration.name}) on ${tenant.subdomain} (${dbName})...`,
      );

      await migration.up(conn, tenant);
      const stepDuration = Date.now() - stepStart;

      // تسجيل الميجريشن كـ "تم تنفيذه" في داتابيز العميل
      await conn.collection(MIGRATIONS_COLLECTION).insertOne({
        id: migration.id,
        name: migration.name,
        description: migration.description || "",
        appliedAt: new Date(),
        executionTimeMs: stepDuration,
      });

      result.appliedCount++;
      result.newMigrations.push(migration.id);
    }

    result.executionTimeMs = Date.now() - startTime;
    return result;
  } catch (err: any) {
    result.success = false;
    result.error = err.message || String(err);
    result.executionTimeMs = Date.now() - startTime;
    console.error(
      `❌ Migration failed for tenant ${tenant.subdomain}:`,
      err.message || err,
    );
    return result;
  }
}

/**
 * تشغيل الميجريشنز عبر جميع العملاء النشطين (أو عميل محدد)
 */
export async function runAllTenantMigrations(options?: {
  tenantId?: string;
  subdomain?: string;
  dryRun?: boolean;
}): Promise<MigrationSummaryReport> {
  const filter: any = { status: { $ne: "suspended" } };

  if (options?.tenantId) {
    filter._id = options.tenantId;
  } else if (options?.subdomain) {
    filter.subdomain = options.subdomain.toLowerCase().trim();
  }

  const clients = await ClientModel.find(filter).lean();

  const report: MigrationSummaryReport = {
    totalTenants: clients.length,
    migratedCount: 0,
    alreadyUpToDateCount: 0,
    failedCount: 0,
    totalNewMigrationsApplied: 0,
    registeredMigrationsCount: allTenantMigrations.length,
    results: [],
  };

  for (const client of clients) {
    const res = await runMigrationsForTenant(client, options?.dryRun);
    report.results.push(res);

    if (!res.success) {
      report.failedCount++;
    } else if (res.appliedCount > 0) {
      report.migratedCount++;
      report.totalNewMigrationsApplied += res.appliedCount;
    } else {
      report.alreadyUpToDateCount++;
    }
  }

  return report;
}

/**
 * فحص حالة الميجريشنز لجميع العملاء لمعرفة من يحتاج لتحديث
 */
export async function getTenantMigrationsStatus(): Promise<{
  registeredMigrations: { id: string; name: string }[];
  tenants: TenantMigrationStatusItem[];
  allUpToDate: boolean;
}> {
  const clients = await ClientModel.find({}).lean();
  const registered = allTenantMigrations.map((m) => ({
    id: m.id,
    name: m.name,
  }));
  const items: TenantMigrationStatusItem[] = [];

  for (const client of clients) {
    const dbName = client.db_name || `sc_${client._id.toString()}`;
    let appliedIds = new Set<string>();

    try {
      const conn = await getTenantDatabase(dbName);
      appliedIds = await getAppliedMigrationIds(conn);
    } catch {}

    const pending = allTenantMigrations.filter((m) => !appliedIds.has(m.id));

    items.push({
      tenantId: client._id.toString(),
      subdomain: client.subdomain,
      dbName,
      status: client.status,
      appliedCount: appliedIds.size,
      pendingCount: pending.length,
      pendingMigrationIds: pending.map((m) => m.id),
      isUpToDate: pending.length === 0,
    });
  }

  return {
    registeredMigrations: registered,
    tenants: items,
    allUpToDate: items.every((i) => i.isUpToDate),
  };
}
