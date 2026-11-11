import type { TenantMigration } from "./types";

/**
 * Migration 001: Initial Schema Setup
 * يتأكد من وجود الكولكشنات الأساسية (metadata, users, themes)
 * وإنشاء الفهارس الضرورية لو مش موجودة
 */
export const migration001: TenantMigration = {
  id: "20261111_001_initial_schema",
  name: "Ensure required tenant collections, metadata, and indexes",
  description: "Sets up users, metadata, themes collections and core unique indexes",

  up: async (conn, tenant) => {
    // 1. Metadata
    await conn.createCollection("metadata").catch(() => {});
    const metaCount = await conn.collection("metadata").countDocuments({});
    if (metaCount === 0) {
      await conn.collection("metadata").insertOne({
        client_id: tenant._id,
        company_name: tenant.company_name,
        subdomain: tenant.subdomain,
        created_at: new Date(),
      });
    }

    // 2. Users Collection + Unique index on email
    await conn.createCollection("users").catch(() => {});
    await conn.collection("users").createIndex({ email: 1 }, { unique: true }).catch(() => {});

    // 3. Themes Collection + Unique index on name
    await conn.createCollection("themes").catch(() => {});
    await conn.collection("themes").createIndex({ name: 1 }, { unique: true }).catch(() => {});

    const themeCount = await conn.collection("themes").countDocuments({});
    if (themeCount === 0) {
      await conn.collection("themes").insertMany([
        {
          name: "Theme 1",
          description: "Default Light/Dark Theme",
          isActive: true,
          activeMode: "light",
          availableModes: ["dark", "light"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: "Theme 2",
          description: "Secondary Modern Theme",
          isActive: false,
          activeMode: "light",
          availableModes: ["dark", "light"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  },
};
