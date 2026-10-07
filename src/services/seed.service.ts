import { env } from "../config/env";
import { SuperAdminModel } from "../models/SuperAdmin";
import {
  SuperAdminPermissionModel,
  PERMISSIONS,
} from "../models/SuperAdminPermission";
import { PackageModel } from "../models/Package";

export async function seedRootAdmin(): Promise<void> {
  const existing = await SuperAdminModel.findOne({
    email: env.SUPER_ADMIN_EMAIL,
  });

  let rootAdmin = existing;

  if (!existing) {
    rootAdmin = await SuperAdminModel.create({
      name: env.SUPER_ADMIN_NAME,
      email: env.SUPER_ADMIN_EMAIL,
      password: env.SUPER_ADMIN_PASSWORD,
      is_root: true,
      status: "active",
    });
    console.log(`🌱 Seeded root admin: ${env.SUPER_ADMIN_EMAIL}`);
  } else if (!existing.is_root) {
    existing.is_root = true;
    await existing.save();
    console.log(`🌱 Marked existing admin as root: ${env.SUPER_ADMIN_EMAIL}`);
  } else {
    console.log(`🌱 Root admin already exists: ${env.SUPER_ADMIN_EMAIL}`);
  }

  if (rootAdmin) {
    await SuperAdminPermissionModel.findOneAndUpdate(
      { admin_id: rootAdmin._id },
      {
        $set: {
          permissions: [...PERMISSIONS],
          updated_by: rootAdmin._id,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }
}

/**
 * يزرع باقة افتراضية لو مفيش أي باقة.
 */
export async function seedDefaultPackage(): Promise<void> {
  const count = await PackageModel.countDocuments();
  if (count > 0) return;

  await PackageModel.create({
    name: "Basic Plan",
    description: "Default starter plan",
    monthly_price: 10,
    quarterly_price: 25,
    half_yearly_price: 45,
    yearly_price: 80,
    status: true,
    features: {
      haveEcommerce: false,
      haveMobileApp: false,
      havePOS: false,
      haveReports: true,
      haveStockTake: false,
    },
  });

  console.log("🌱 Seeded default package: Basic Plan");
}
