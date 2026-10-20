import { env } from "../config/env";
import { SuperAdminModel } from "../models/SuperAdmin";
import {
  SuperAdminPermissionModel,
  PERMISSIONS,
} from "../models/SuperAdminPermission";

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
