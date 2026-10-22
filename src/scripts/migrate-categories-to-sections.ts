import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { SectionModel } from "../models/Section";
import { ClientModel } from "../models/Client";
import { SuperAdminPermissionModel } from "../models/SuperAdminPermission";

/**
 * Migration: Categories/Subcategories → Sections
 *
 * - كل Category (رئيسية أو فرعية) بتتحول لـ Section.
 *   الـ key بياخده من slug، ولو موجود بالفعل بيتم إعادة استخدامه.
 * - كل عميل عليه category_id / subcategory_id بيتحولوا لـ sections[].
 * - صلاحيات الأدمن categories:* بتتحول لـ sections:*.
 *
 * آمن ويعيد التشغيل (idempotent) — بيستخدم $addToSet ومش بيمسح أي حاجة.
 *
 * التشغيل:
 *   npm run migrate:sections
 *   npm run migrate:sections -- --unset-legacy   # يشيل category_id/subcategory_id بعد التحويل
 */

const UNSET_LEGACY = process.argv.includes("--unset-legacy");

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

(async () => {
  await connectDB();

  try {
    const db = mongoose.connection.db!;
    const categories = await db
      .collection("categories")
      .find({})
      .sort({ order: 1, name: 1 })
      .toArray();

    console.log(`ℹ️  Found ${categories.length} categor(ies).`);

    const mapping = new Map<string, mongoose.Types.ObjectId>();
    let createdSections = 0;
    let reusedSections = 0;

    for (const category of categories as any[]) {
      const baseKey = slugify(String(category.slug || category.name || "section"));

      let section = await SectionModel.findOne({ key: baseKey });

      if (!section) {
        // لو الـ key محجوز لسيكشن تاني بنفس الاسم، نستخدمه برضه (تجميع)
        let uniqueKey = baseKey;
        let counter = 2;
        while (await SectionModel.exists({ key: uniqueKey })) {
          uniqueKey = `${baseKey}-${counter++}`;
        }

        section = await SectionModel.create({
          key: uniqueKey,
          name: String(category.name || baseKey).trim(),
          ar_name: category.ar_name ?? undefined,
          description: category.description ?? undefined,
          status: category.status === "inactive" ? "inactive" : "active",
          order: Number(category.order) || 0,
        });
        createdSections += 1;
      } else {
        reusedSections += 1;
      }

      mapping.set(String(category._id), section._id as mongoose.Types.ObjectId);
    }

    const clients = await db
      .collection("clients")
      .find({
        $or: [
          { category_id: { $exists: true, $ne: null } },
          { subcategory_id: { $exists: true, $ne: null } },
        ],
      })
      .toArray();

    let updatedClients = 0;

    for (const client of clients as any[]) {
      const ids = [
        client.category_id ? mapping.get(String(client.category_id)) : null,
        client.subcategory_id ? mapping.get(String(client.subcategory_id)) : null,
      ].filter(Boolean) as mongoose.Types.ObjectId[];

      const uniqueIds = [...new Map(ids.map((id) => [String(id), id])).values()];
      if (!uniqueIds.length) continue;

      await ClientModel.updateOne(
        { _id: client._id },
        {
          $addToSet: { sections: { $each: uniqueIds } },
          ...(UNSET_LEGACY
            ? { $unset: { category_id: "", subcategory_id: "" } }
            : {}),
        },
      );
      updatedClients += 1;
    }

    // صلاحيات الأدمن
    const permissionDocs = await SuperAdminPermissionModel.find({
      permissions: /^categories:/,
    });

    let migratedPermissions = 0;

    for (const doc of permissionDocs) {
      const mapped = doc.permissions.map((permission) =>
        permission.replace(/^categories:/, "sections:"),
      ) as typeof doc.permissions;

      doc.permissions = [...new Set(mapped)] as typeof doc.permissions;
      await doc.save();
      migratedPermissions += 1;
    }

    console.log("✅ Migration finished");
    console.log(`   Sections created : ${createdSections}`);
    console.log(`   Sections reused  : ${reusedSections}`);
    console.log(`   Clients updated  : ${updatedClients}/${clients.length}`);
    console.log(`   Admins permissions migrated: ${migratedPermissions}`);
    if (!UNSET_LEGACY) {
      console.log(
        "   ℹ️  category_id/subcategory_id still exist on old clients (safe). Run with --unset-legacy to remove them.",
      );
    }
  } catch (err: any) {
    console.error("❌ Migration failed:", err?.stack || err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
