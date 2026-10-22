import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { SectionModel } from "../models/Section";

/**
 * السكاشن الأساسية — نفس الأنواع الموجودة في wegz-backend (sectionMap).
 * seed آمن: بيضيف الناقص بس ومش بيلمس أي تعديلات اتعملت من الداشبورد.
 */
const DEFAULT_SECTIONS = [
  { key: "announcement", name: "Announcement", ar_name: "شريط الإعلانات", order: 1 },
  { key: "header", name: "Header", ar_name: "الهيدر", order: 2 },
  { key: "hero", name: "Hero", ar_name: "الهيرو", order: 3 },
  { key: "info", name: "Info", ar_name: "معلومات", order: 4 },
  { key: "info2", name: "Info 2", ar_name: "معلومات 2", order: 5 },
  { key: "testimonials", name: "Testimonials", ar_name: "آراء العملاء", order: 6 },
  { key: "contact", name: "Contact", ar_name: "اتصل بنا", order: 7 },
  { key: "footer", name: "Footer", ar_name: "الفوتر", order: 8 },
];

(async () => {
  await connectDB();

  try {
    let created = 0;
    let existing = 0;

    for (const section of DEFAULT_SECTIONS) {
      const { key, ...rest } = section;
      const result = await SectionModel.updateOne(
        { key },
        { $setOnInsert: { ...rest, status: "active" } },
        { upsert: true },
      );

      if (result.upsertedCount > 0) created += 1;
      else existing += 1;
    }

    console.log(
      `✅ Sections seeded — created: ${created}, already existed: ${existing}`,
    );
  } catch (err: any) {
    console.error("❌ Seeding sections failed:", err?.stack || err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
