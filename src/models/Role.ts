import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { PERMISSIONS, type Permission } from "./SuperAdminPermission";

// ============================================================================
// Role — قالب صلاحيات مسمّى (Cashier / Manager / ...)
//
// الفكرة:
// - الأدمن بياخد Role واحد بس.
// - صلاحيات الأدمن بتتحسب LIVE من الـ Role وقت كل request
//   (يعني لو عدّلت صلاحيات الـ Role، كل الأعضاء بيتأثروا فورًا).
// - الأدمن اللي معندوش Role بيفضل شغال بالنظام القديم
//   (SuperAdminPermission.permissions) للتوافق مع البيانات الموجودة.
// ============================================================================

export const ROLE_STATUSES = ["active", "inactive"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

export interface IRole extends Document {
  _id: Types.ObjectId;
  /** معرّف فريد — lowercase، مثال: "cashier" */
  name: string;
  /** الاسم المعروض — مثال: "Cashier" */
  label: string;
  label_ar?: string;
  description?: string;
  permissions: Permission[];
  status: RoleStatus;
  /** أدوار النظام — محدش غير الـ root يقدر يعدّلها أو يحذفها */
  is_system: boolean;
  created_by?: Types.ObjectId;
  updated_by?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9][a-z0-9_-]*$/, "Invalid role name"],
    },
    label: { type: String, required: true, trim: true },
    label_ar: { type: String, trim: true },
    description: { type: String, trim: true },
    permissions: {
      type: [{ type: String, enum: PERMISSIONS }],
      default: [],
    },
    status: {
      type: String,
      enum: ROLE_STATUSES,
      default: "active",
      index: true,
    },
    is_system: { type: Boolean, default: false },
    created_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
    updated_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { timestamps: true },
);

export const RoleModel = mongoose.model<IRole>("Role", schema);
