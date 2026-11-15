import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { ThemeModel } from "../models/Theme";

/**
 * الثيمات الأساسية في Master DB (Super Admin).
 * seed آمن: يضيف الثيمات غير الموجودة فقط ولا يمس أي تعديلات سابقة.
 */
const DEFAULT_THEMES = [
  {
    key: "theme-1",
    name: "Theme 1",
    description: "Default Classic Light & Dark Theme",
    status: "active",
    availableModes: ["dark", "light"],
    defaultMode: "light",
    order: 1,
  },
  {
    key: "theme-2",
    name: "Theme 2",
    description: "Modern Minimalist Theme",
    status: "active",
    availableModes: ["dark", "light"],
    defaultMode: "light",
    order: 2,
  },
];

(async () => {
  await connectDB();

  try {
    let created = 0;
    let existing = 0;

    for (const theme of DEFAULT_THEMES) {
      const { key, ...rest } = theme;
      const result = await ThemeModel.updateOne(
        { key },
        { $setOnInsert: { ...rest, key } },
        { upsert: true },
      );

      if (result.upsertedCount > 0) created += 1;
      else existing += 1;
    }

    console.log(
      `✅ Master Themes seeded — created: ${created}, already existed: ${existing}`,
    );
  } catch (err: any) {
    console.error("❌ Seeding themes failed:", err?.stack || err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
