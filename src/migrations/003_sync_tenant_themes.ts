import type { TenantMigration } from "./types";

/**
 * Migration 003: Sync Tenant Themes
 * يتأكد من أن كولكشن الثيمات في قواعد بيانات الـ tenants جاهزة
 * وفيها ثيم نشط واحد على الأقل، مع الفهارس اللازمة.
 */
export const migration003: TenantMigration = {
  id: "20261115_003_sync_tenant_themes",
  name: "Ensure tenant themes collection has active theme and proper structure",
  description: "Ensures at least one active theme is set per tenant and creates indexes",

  up: async (conn) => {
    await conn.createCollection("themes").catch(() => {});
    await conn.collection("themes").createIndex({ isActive: 1 }).catch(() => {});
    await conn.collection("themes").createIndex({ name: 1 }, { unique: true }).catch(() => {});

    // التأكد من وجود ثيم مفعل
    const activeCount = await conn
      .collection("themes")
      .countDocuments({ isActive: true });

    if (activeCount === 0) {
      const anyTheme = await conn.collection("themes").findOne({});
      if (anyTheme) {
        await conn
          .collection("themes")
          .updateOne({ _id: anyTheme._id }, { $set: { isActive: true } });
      } else {
        // لو الداتابيز جديدة ومفيهاش أي ثيم
        await conn.collection("themes").insertOne({
          name: "Theme 1",
          description: "Default Theme",
          isActive: true,
          activeMode: "light",
          availableModes: ["dark", "light"],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  },
};
