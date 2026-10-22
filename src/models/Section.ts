import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

/**
 * Section — قسم من أقسام الموقع (Hero, Header, Footer, ...).
 *
 * بدل شجرة Category/Subcategory القديمة، الـ Section هنا مستوى واحد مسطّح.
 * كل عميل بياخد مجموعة Sections (Client.sections) من إجمالي السكاشن المتاحة،
 * وبكده نقدر نعرض لكل عميل: عنده كام سيكشن من أصل كام.
 *
 * الـ key ثابت ومستخدم في ربط السكاشن بأنواعها في wegz-backend
 * (hero / header / footer / announcement / info / info2 / testimonials / contact).
 */
export interface ISection extends Document {
  _id: Types.ObjectId;
  key: string;
  name: string;
  ar_name?: string;
  description?: string;
  icon?: string;
  status: "active" | "inactive";
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISection>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    ar_name: { type: String, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, trim: true },
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

export const SectionModel = mongoose.model<ISection>("Section", schema);
