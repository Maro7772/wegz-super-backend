import type { TenantMigration } from "./types";

/**
 * Migration 002: Add Section Indexes & Theme Defaults
 * ينشئ فهارس على السكاشن لتسريع الاستعلامات وتحديث بيانات الثيمات القديمة
 */
export const migration002: TenantMigration = {
  id: "20261111_002_section_indexes_and_theme_modes",
  name: "Ensure section indexes and available theme modes",
  description: "Creates indexes for sections and backfills theme modes if missing",

  up: async (conn) => {
    // 1. تحديث أي ثيمات قديمة لا تحتوي على activeMode أو availableModes
    await conn.collection("themes").updateMany(
      { activeMode: { $exists: false } },
      { $set: { activeMode: "light" } },
    );

    await conn.collection("themes").updateMany(
      { availableModes: { $exists: false } },
      { $set: { availableModes: ["dark", "light"] } },
    );

    // 2. إنشاء فهارس على كولكشنات السكاشن لتسريع الـ Landing Page (isVisible + createdAt)
    const sectionCollections = [
      "announcements",
      "headers",
      "heroes",
      "infos",
      "info2",
      "testimonials",
      "contacts",
      "footers",
    ];

    for (const collName of sectionCollections) {
      await conn.createCollection(collName).catch(() => {});
      await conn
        .collection(collName)
        .createIndex({ isVisible: 1, createdAt: -1 })
        .catch(() => {});
    }
  },
};
