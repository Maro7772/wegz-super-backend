/**
 * CLI Migration Runner for All Tenant Schemas
 *
 * الاستخدام:
 *   npx tsx src/scripts/migrate-tenants.ts               # تشغيل التعديلات الجديدة لكل العملاء
 *   npx tsx src/scripts/migrate-tenants.ts --dry-run     # معاينة التعديلات بدون تطبيق
 *   npx tsx src/scripts/migrate-tenants.ts --subdomain=acme # تشغيل لعميل محدد فقط
 *   npx tsx src/scripts/migrate-tenants.ts --status      # عرض حالة العملاء والميجريشنز المعلقة
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import {
  runAllTenantMigrations,
  getTenantMigrationsStatus,
} from "../services/tenantMigration.service";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isStatus = args.includes("--status");
const subdomainArg = args.find((a) => a.startsWith("--subdomain="))?.split("=")[1];

async function main() {
  console.log("==========================================================");
  console.log("🚀 Multi-Tenant Schema Migration Runner");
  console.log("==========================================================");

  await connectDB();

  try {
    if (isStatus) {
      console.log("\n📊 Checking migration status across all tenants...\n");
      const status = await getTenantMigrationsStatus();

      console.log(`Registered migrations in codebase: ${status.registeredMigrations.length}`);
      status.registeredMigrations.forEach((m, idx) => {
        console.log(`  ${idx + 1}. [${m.id}] ${m.name}`);
      });

      console.log(`\nTenants (${status.tenants.length} total):`);
      for (const t of status.tenants) {
        const icon = t.isUpToDate ? "✅" : "⚠️ ";
        console.log(
          `  ${icon} ${t.subdomain} (${t.dbName}): ${t.appliedCount} applied, ${t.pendingCount} pending`,
        );
        if (t.pendingMigrationIds.length > 0) {
          console.log(`     Pending: ${t.pendingMigrationIds.join(", ")}`);
        }
      }

      console.log(`\nOverall status: ${status.allUpToDate ? "All tenants up to date! 🎉" : "Some tenants have pending migrations ⚠️"}`);
      return;
    }

    console.log(
      `\n⚙️  Running migrations (${isDryRun ? "DRY RUN MODE" : "LIVE MODE"})${subdomainArg ? ` for subdomain: ${subdomainArg}` : " for ALL tenants"}...\n`,
    );

    const report = await runAllTenantMigrations({
      subdomain: subdomainArg,
      dryRun: isDryRun,
    });

    console.log("==========================================================");
    console.log("📋 Migration Summary Report");
    console.log("==========================================================");
    console.log(`Total Tenants Checked:       ${report.totalTenants}`);
    console.log(`Tenants Updated:             ${report.migratedCount}`);
    console.log(`Tenants Already Up-to-date:  ${report.alreadyUpToDateCount}`);
    console.log(`Tenants Failed:              ${report.failedCount}`);
    console.log(`Total New Migrations:        ${report.totalNewMigrationsApplied}`);
    console.log("----------------------------------------------------------");

    for (const r of report.results) {
      if (!r.success) {
        console.log(`❌ ${r.subdomain} (${r.dbName}): FAILED - ${r.error}`);
      } else if (r.appliedCount > 0) {
        console.log(
          `✅ ${r.subdomain} (${r.dbName}): Applied ${r.appliedCount} new migrations: ${r.newMigrations.join(", ")} (${r.executionTimeMs}ms)`,
        );
      } else {
        console.log(`⚡ ${r.subdomain} (${r.dbName}): Already up-to-date (${r.alreadyAppliedCount} applied)`);
      }
    }

    console.log("==========================================================");
  } catch (err: any) {
    console.error("❌ Fatal migration error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();
