import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

// ============================================================================
// Actions — 4 بس
// ============================================================================

export const ACTIONS = ["view", "add", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, { en: string; ar: string }> = {
  view: { en: "View", ar: "عرض" },
  add: { en: "Add", ar: "إضافة" },
  edit: { en: "Edit", ar: "تعديل" },
  delete: { en: "Delete", ar: "حذف" },
};

// ============================================================================
// Resources
// ============================================================================

export interface ResourceDefinition {
  key: string;
  label_en: string;
  label_ar: string;
  actions: readonly Action[];
  deprecated?: boolean;
}

export const RESOURCES: readonly ResourceDefinition[] = [
  {
    key: "clients",
    label_en: "Clients",
    label_ar: "العملاء",
    actions: ["view", "add", "edit", "delete"],
  },
  {
    key: "sections",
    label_en: "Sections",
    label_ar: "الأقسام",
    actions: ["view", "add", "edit", "delete"],
  },
  {
    key: "sales",
    label_en: "Sales",
    label_ar: "المبيعات",
    actions: ["view", "add", "edit", "delete"],
  },
  {
    key: "payments",
    label_en: "Payments",
    label_ar: "المدفوعات",
    actions: ["view", "add", "edit", "delete"],
  },
  {
    key: "reports",
    label_en: "Operation Reports",
    label_ar: "تقارير التشغيل",
    actions: ["view"],
  },
  {
    key: "financial_reports",
    label_en: "Financial Reports",
    label_ar: "التقارير المالية",
    actions: ["view"],
  },
  {
    key: "admins",
    label_en: "Super Admins",
    label_ar: "المشرفين",
    actions: ["view", "add", "edit", "delete"],
  },
  {
    key: "audit",
    label_en: "Audit Logs",
    label_ar: "سجل التدقيق",
    actions: ["view"],
  },
  {
    key: "provisioning",
    label_en: "Provisioning",
    label_ar: "التجهيز",
    actions: ["add"],
  },
  {
    key: "dashboard",
    label_en: "Dashboard",
    label_ar: "لوحة التحكم",
    actions: ["view"],
  },
] as const;

// ============================================================================
// Permissions (flat — derived)
// ============================================================================

export const PERMISSIONS = RESOURCES.flatMap((r) =>
  r.actions.map((a) => `${r.key}:${a}` as const),
);

export type Permission = (typeof PERMISSIONS)[number];

export const DEPRECATED_PERMISSIONS: string[] = RESOURCES.filter(
  (r) => r.deprecated,
).flatMap((r) => r.actions.map((a) => `${r.key}:${a}`));

export const ACTIVE_PERMISSIONS = PERMISSIONS.filter(
  (p) => !DEPRECATED_PERMISSIONS.includes(p),
);

// ============================================================================
// Catalog builder (للـ frontend matrix)
// ============================================================================

export function buildPermissionsCatalog() {
  return RESOURCES.filter((r) => !r.deprecated).map((r) => ({
    key: r.key,
    label_en: r.label_en,
    label_ar: r.label_ar,
    actions: r.actions.map((a) => ({
      key: a,
      label_en: ACTION_LABELS[a].en,
      label_ar: ACTION_LABELS[a].ar,
      permission: `${r.key}:${a}` as Permission,
    })),
    permissions: r.actions.map((a) => `${r.key}:${a}` as Permission),
  }));
}

// ============================================================================
// Mongoose schema
// ============================================================================

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
