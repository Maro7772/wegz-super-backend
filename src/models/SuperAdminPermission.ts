import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

/**
 * قائمة الصلاحيات المتاحة في النظام.
 * أي إضافة هنا لازم تنعكس في الـ middleware والمستخدمين.
 */
export const PERMISSIONS = [
  // ---- Clients ----
  "clients:read",
  "clients:create",
  "clients:update",
  "clients:delete",

  // ---- Packages ----
  "packages:read",
  "packages:create",
  "packages:update",
  "packages:delete",

  // ---- Subscriptions ----
  "subscriptions:read",
  "subscriptions:update",

  // ---- Admins Management ----
  "admins:read",
  "admins:create",
  "admins:update",
  "admins:delete",
  /** ← ده اللي بيسمح بتعديل صلاحيات باقي الـ Admins (Root فقط) */
  "admins:update_permissions",

  // ---- Audit ----
  "audit:read",

  // ---- Provisioning ----
  "provisioning:run",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface ISuperAdminPermission extends Document {
  _id: Types.ObjectId;
  admin_id: Types.ObjectId;
  permissions: Permission[];
  updated_by?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISuperAdminPermission>(
  {
    admin_id: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
      unique: true,
      index: true,
    },
    permissions: [{ type: String, enum: PERMISSIONS }],
    updated_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { timestamps: true },
);

export const SuperAdminPermissionModel = mongoose.model<ISuperAdminPermission>(
  "SuperAdminPermission",
  schema,
);
