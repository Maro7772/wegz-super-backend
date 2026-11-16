import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { PackageModel } from "../models/Package";
import { PaymentMethodModel } from "../models/PaymentMethod";

const DEFAULT_PACKAGES = [
  {
    name: "الباقة الشهرية الأساسية",
    price: 350,
    months: 1,
    status: "active" as const,
    discount: 0,
  },
  {
    name: "الباقة الربع سنوية (3 شهور)",
    price: 1000,
    months: 3,
    status: "active" as const,
    discount: 50,
  },
  {
    name: "الباقة النصف سنوية (6 شهور)",
    price: 1900,
    months: 6,
    status: "active" as const,
    discount: 200,
  },
  {
    name: "الباقة السنوية الاحترافية (12 شهر)",
    price: 3600,
    months: 12,
    status: "active" as const,
    discount: 600,
  },
];

const DEFAULT_PAYMENT_METHODS = [
  {
    name: "فودافون كاش",
    description: "يرجى التحويل على رقم المحفظة وكتابة رقم العملية في الإيصال",
    status: "active" as const,
  },
  {
    name: "تحويل بنكي",
    description: "التحويل على الحساب البنكي وإرفاق صورة إشعار التحويل",
    status: "active" as const,
  },
  {
    name: "إنستاباي (InstaPay)",
    description: "التحويل عبر تطبيق إنستاباي وإرفاق لقطة شاشة لعملية التحويل",
    status: "active" as const,
  },
];

(async () => {
  await connectDB();

  try {
    console.log("🚀 جاري تهيئة وفحص الباقات وطرق الدفع في قاعدة البيانات...");

    // 1. إضافة الباقات
    let pkgsCreated = 0;
    for (const pkg of DEFAULT_PACKAGES) {
      const exists = await PackageModel.findOne({ name: pkg.name });
      if (!exists) {
        await PackageModel.create(pkg);
        pkgsCreated++;
      }
    }
    console.log(`✅ الباقات: تم إضافة ${pkgsCreated} باقة جديدة.`);

    // 2. إضافة طرق الدفع
    let methodsCreated = 0;
    for (const method of DEFAULT_PAYMENT_METHODS) {
      const exists = await PaymentMethodModel.findOne({ name: method.name });
      if (!exists) {
        await PaymentMethodModel.create(method);
        methodsCreated++;
      }
    }
    console.log(`✅ طرق الدفع: تم إضافة ${methodsCreated} طريقة دفع جديدة.`);

    console.log("🎉 تمت العملية بنجاح!");
  } catch (err: any) {
    console.error("❌ خطأ أثناء تهيئة البيانات:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
