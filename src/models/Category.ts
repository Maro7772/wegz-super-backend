import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

/**
 * Category / Subcategory — شجرة من مستويين:
 *  - parent_id = null  → Category (قسم رئيسي)
 *  - parent_id != null → Subcategory (قسم فرعي)
 *
 * تُستخدم لتصنيف العملاء (Client.category_id / Client.subcategory_id)
 * وتقدر تتوسّع بعدين لأي كيان تاني (منتجات، ثيمات، ...).
 */
export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  slug?: string;
  description?: string;
  parent_id?: Types.ObjectId | null;
  status: "active" | "inactive";
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: { type: String, trim: true },
    parent_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ممنوع تكرار نفس الاسم تحت نفس الأب
schema.index({ name: 1, parent_id: 1 }, { unique: true });

export const CategoryModel = mongoose.model<ICategory>("Category", schema);
