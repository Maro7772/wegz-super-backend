import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import bcrypt from "bcrypt";

export interface ISuperAdmin extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  /** الأساسي — ليه كل الصلاحيات ومحدش يقدر يعدّلها غير بأمر صريح */
  is_root: boolean;
  /** الأدمن ممكن ياخد Role واحد، وصلاحياته بتتحسب منه live */
  role_id?: Types.ObjectId | null;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
  comparePassword(plain: string): Promise<boolean>;
}

const schema = new Schema<ISuperAdmin>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    is_root: { type: Boolean, default: false, index: true },
    role_id: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      default: null,
      index: true,
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

schema.pre("save", async function (next) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

schema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.password);
};

export const SuperAdminModel = mongoose.model<ISuperAdmin>(
  "SuperAdmin",
  schema,
);
